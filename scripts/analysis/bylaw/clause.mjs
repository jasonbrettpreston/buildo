// SPEC LINK: docs/specs/01-pipeline/68_mcbylaw_standard.md §9 G-CLAUSE ("expression and application literals are in the
//            cited clause; every clause literal used or listed with a closed reason; variables licensed; units bind per
//            §7.4; anti-vacuity: every digit run and number word covered; application evidence ≥ 2 words inside the cited
//            clause and matching the token's patterns; `any` only when the clause names none. For a unit with an
//            adjudicated `consolidation_mismatch`, the cited clause is the `enacting_source` excerpt"), §6.4 rules 6, 7,
//            §7.4; docs/specs/01-pipeline/69_mcbylaw_policy.md M-39; docs/reports/mcbylaw-phase1-plan.md S6
//
// G-CLAUSE. PURE. Runs on agreed / adjudicated units only (agree.mjs agreedUnits()); pending drafts never reach it.
//
//   checkClause({slice, units, vocab, adjudications}) → {status, pass, checked, violations, counts}
//   selfTest()
//
// The cited clause of a statement is the clause its `@path` names (lead-ins + subtree, authored.mjs clauseScope); an
// argument's literals bind to the argument's own `@path`; a condition's literals bind to the unit's own clause. A clause
// literal is "used" when an expression / condition literal of equal value (and equal unit, unless the clause number is
// unitless) binds to it, or "listed" by a `literals_not_expressed` entry naming its clause. A lead-in's literals are
// checked once every leaf under the lead-in is covered by agreed units.
//
// Reason codes (closed):
//   cited_clause_unresolved     a statement / argument / literals_not_expressed clause path names no clause of the row
//   literal_not_in_clause       an expression, condition or listed literal is not a literal of its cited clause
//   literal_unaccounted         a literal of a covered clause is neither used nor listed
//   variable_unlicensed         a target / variable whose vocab licensing phrases (dsl_target.patterns,
//                               dsl_input.licensed_by) do not occur in the unit's text, or that declares none
//   unit_binding                a literal's unit does not bind to its variable / target, or an operator is unit-illegal
//                               (dsl.mjs checkStatement; condition units)
//   expression_unparseable      an agreed numeric_expression or condition.if does not parse
//   evidence_short              an application token has no evidence phrase, or one under 2 words
//   evidence_not_in_clause      an evidence phrase does not occur in the cited clause
//   evidence_pattern_mismatch   the vocab entry of the token declares `patterns` and the phrase matches none
//   any_with_named_type         building type `any` while the clause names a building type no by_type key covers
//   number_uncovered            a digit run / number word the slicer left uncovered and no literals_not_expressed lists

import { DslError, argPathsOf, checkStatement, parseCond, parseExpression, variablesOf } from './dsl.mjs';
import { GENERATED_CONDITION_TOKENS, buildIndex, clauseScope, gateResult, resolveClause, unitView, violation } from './authored.mjs';
import { extractLiterals } from './slice.mjs';
import { clauseFixtures } from './authored-fixtures.mjs';

export const REASON_CODES = Object.freeze([
  'cited_clause_unresolved',
  'literal_not_in_clause',
  'literal_unaccounted',
  'variable_unlicensed',
  'unit_binding',
  'expression_unparseable',
  'evidence_short',
  'evidence_not_in_clause',
  'evidence_pattern_mismatch',
  'any_with_named_type',
  'number_uncovered',
]);

const cmpStr = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const norm = (s) => String(s ?? '').toLowerCase().replace(/[‘’“”"]/g, '"').replace(/\s+/g, ' ').trim();
const words = (s) => String(s ?? '').trim().split(/\s+/).filter(Boolean).length;
const EPS = 1e-9;
const sameValue = (a, b) => Math.abs(Number(a) - Number(b)) < EPS;
/** A clause literal (unit may be null for a bare number) vs a bound literal (unit may be null for a listed bare word). */
const litMatch = (clauseLit, value, unit) => sameValue(clauseLit.value, value) && (clauseLit.unit == null || unit == null || clauseLit.unit === unit || (unit === 'ratio' && clauseLit.unit == null));
/** One literal OCCURRENCE (its offset in the verbatim): a bound literal discharges one occurrence, never every equal value. */
const litKey = (l) => `${l.clause_path}|${l.start}`;

/** Literals in an expression AST, each with the argument path it is bound to (the nearest `@path`). */
function boundLiterals(node, at, out = []) {
  if (!node || typeof node !== 'object') return out;
  const here = node.argPath || at;
  if (node.type === 'lit') {
    out.push({ lit: node, path: here });
    return out;
  }
  for (const k of Object.keys(node)) {
    if (k === 'argPath') continue;
    const v = node[k];
    if (Array.isArray(v)) for (const x of v) boundLiterals(x, here, out);
    else if (v && typeof v === 'object') boundLiterals(v, here, out);
  }
  return out;
}
function byTypeKeys(node, out = new Set()) {
  if (!node || typeof node !== 'object') return out;
  if (node.type === 'by_type') for (const e of node.entries) out.add(e.key);
  for (const v of Object.values(node)) {
    if (Array.isArray(v)) for (const x of v) byTypeKeys(x, out);
    else if (v && typeof v === 'object') byTypeKeys(v, out);
  }
  return out;
}

/** The vocab view dsl.mjs checkStatement expects (building_type as a list of names). */
function dslVocab(vocab) {
  return { dsl_target: vocab.dsl_target, dsl_input: vocab.dsl_input, label_letter: vocab.label_letter, overlay_code: vocab.overlay_code, building_type: Object.keys(vocab.building_type || {}) };
}
/** Units of a condition: wrap it in an if() so dsl.mjs checks the comparison units; the dummy target is dropped. */
function conditionUnitErrors(cond, dv) {
  const errs = checkStatement({ type: 'statement', target: '__condition__', expr: { type: 'if', cond, a: { type: 'unlimited' }, b: { type: 'unlimited' } }, path: '' }, dv);
  return errs.filter((e) => !e.startsWith('unknown_target'));
}
function licensePhrases(vocab, name) {
  const t = vocab.dsl_target && vocab.dsl_target[name];
  if (t) return Array.isArray(t.patterns) ? t.patterns : [];
  const i = vocab.dsl_input && vocab.dsl_input[name];
  if (i) return Array.isArray(i.licensed_by) ? i.licensed_by : [];
  return null; // unknown: unit_binding reports it
}
/** Building-type names as they read in the text ("semi_detached_house" → "semi detached house"; hyphens folded). */
function namedTypes(text, vocab) {
  const t = ` ${norm(text).replace(/-/g, ' ')} `;
  const out = [];
  for (const k of Object.keys(vocab.building_type || {})) {
    if (k === 'any') continue;
    const name = k.replace(/_/g, ' ');
    if (new RegExp(`(?<![a-z])${name}(?![a-z])`).test(t)) out.push(k);
  }
  return out;
}

/** M-39: unit citation (`<article><clause path>`) → the enacting excerpt that becomes its cited clause. */
function consolidationExcerpts(adjudications) {
  const m = new Map();
  for (const e of (adjudications && adjudications.adjudications) || []) {
    if (e && e.kind === 'consolidation_mismatch' && e.enacting_source && e.enacting_source.excerpt && typeof e.enacting_source.excerpt.text === 'string') m.set(String(e.unit), e.enacting_source.excerpt.text);
  }
  return m;
}

/** G-CLAUSE over the agreed units. PURE. */
export function checkClause({ slice, units = new Map(), vocab, adjudications = null } = {}) {
  const v = [];
  const index = buildIndex(slice);
  const dv = dslVocab(vocab);
  const excerpts = consolidationExcerpts(adjudications);
  const counts = { units: 0, statements: 0, literals_bound: 0, literals_listed: 0, consolidation_mismatch_units: 0 };
  const accounted = new Map(); // regulation_id → Set(litKey)
  const listedTokens = new Map(); // regulation_id → Set(raw uncovered tokens listed)
  const covered = new Map(); // regulation_id → Set(leaf path)
  const m39 = new Map(); // regulation_id → [{unit_id, clause_path, excerptLits, used:Set}]

  for (const id of [...units.keys()].sort(cmpStr)) {
    const u = units.get(id);
    const view = unitView(index, id);
    if (!view) continue; // G-SHAPE authored_orphan
    counts.units++;
    const row = view.row;
    const reg = row.regulation_id;
    if (!accounted.has(reg)) accounted.set(reg, new Set());
    if (!listedTokens.has(reg)) listedTokens.set(reg, new Set());
    if (!covered.has(reg)) covered.set(reg, new Set());
    for (const c of row.clauses) if (c.leaf && c.path.startsWith(view.clause_path)) covered.get(reg).add(c.path);
    const acc = accounted.get(reg);
    const citation = `${row.article}${view.clause_path}`;
    const excerpt = excerpts.get(citation) ?? excerpts.get(id) ?? null;
    let excerptRec = null;
    if (excerpt !== null) {
      counts.consolidation_mismatch_units++;
      excerptRec = { unit_id: id, clause_path: view.clause_path, lits: extractLiterals(excerpt), used: new Set() };
      if (!m39.has(reg)) m39.set(reg, []);
      m39.get(reg).push(excerptRec);
    }
    const leadIns = row.clauses.filter((c) => c.path !== view.clause_path && view.clause_path.startsWith(c.path)).map((c) => c.text.trim());
    const unitText = excerpt !== null ? [...leadIns, excerpt].join(' ') : view.text;

    /** Find a bound literal in the cited clause; mark it used. */
    const bind = (value, unit, clausePath, what) => {
      if (excerptRec && clausePath.startsWith(view.clause_path)) {
        const hit = excerptRec.lits.filter((l) => litMatch(l, value, unit));
        if (hit.length) {
          const free = hit.find((l) => !excerptRec.used.has(l.start)) || hit[0];
          excerptRec.used.add(free.start);
          return true;
        }
        // M-39: the enacting excerpt is the cited clause; the consolidation literals are never a fallback
        v.push(violation('literal_not_in_clause', id, `${what} ${value}${unit ?? ''} is not in the enacting excerpt (M-39)`));
        return false;
      }
      const scope = clauseScope(row, clausePath);
      const hit = row.literals.filter((l) => (scope.subtree.has(l.clause_path) || scope.ancestors.has(l.clause_path)) && litMatch(l, value, unit));
      if (!hit.length) {
        v.push(violation('literal_not_in_clause', id, `${what} ${value}${unit ?? ''} is not a literal of ${row.article}${clausePath}`));
        return false;
      }
      // the first occurrence not yet used; a value bound more often than it occurs reuses one (no new fact)
      const free = hit.sort((a, b) => a.start - b.start).find((l) => !acc.has(litKey(l))) || hit[0];
      acc.add(litKey(free));
      return true;
    };

    // statements
    let statements = [];
    try {
      statements = parseExpression(u.numeric_expression);
    } catch (err) {
      if (!(err instanceof DslError)) throw err;
      v.push(violation('expression_unparseable', id, `numeric_expression: ${err.message}`));
    }
    let cond = null;
    if (u.condition && u.condition !== 'none' && u.condition.if && u.condition.if !== 'none') {
      try {
        cond = parseCond(u.condition.if);
      } catch (err) {
        if (!(err instanceof DslError)) throw err;
        v.push(violation('expression_unparseable', id, `condition.if: ${err.message}`));
      }
    }
    const vars = new Set();
    for (const s of statements) {
      counts.statements++;
      vars.add(s.target);
      for (const x of variablesOf(s.expr)) vars.add(x);
      for (const e of checkStatement(s, dv)) v.push(violation('unit_binding', id, e));
      const cl = resolveClause(row, s.path);
      if (!cl) {
        v.push(violation('cited_clause_unresolved', id, `@${s.path}`));
        continue;
      }
      for (const p of argPathsOf(s.expr)) if (!resolveClause(row, p)) v.push(violation('cited_clause_unresolved', id, `argument @${p}`));
      for (const { lit, path } of boundLiterals(s.expr, null)) {
        const at = path ? resolveClause(row, path) : cl;
        if (!at) continue; // reported above
        if (bind(lit.value, lit.unit, at.path, 'expression literal')) counts.literals_bound++;
      }
    }
    if (cond) {
      for (const x of variablesOf(cond)) vars.add(x);
      for (const e of conditionUnitErrors(cond, dv)) v.push(violation('unit_binding', id, `condition: ${e}`));
      for (const { lit } of boundLiterals(cond, null)) if (bind(lit.value, lit.unit, view.clause_path, 'condition literal')) counts.literals_bound++;
    }

    // licensing
    const lowText = norm(unitText);
    for (const name of [...vars].sort(cmpStr)) {
      const phrases = licensePhrases(vocab, name);
      if (phrases === null) continue; // unknown variable → unit_binding
      if (!phrases.length) v.push(violation('variable_unlicensed', id, `${name}: vocab declares no licensing phrase`));
      else if (!phrases.some((p) => lowText.includes(norm(p)))) v.push(violation('variable_unlicensed', id, `${name}: none of ${JSON.stringify(phrases)} occurs in the clause`));
    }

    // literals_not_expressed
    for (const e of Array.isArray(u.literals_not_expressed) ? u.literals_not_expressed : []) {
      const cl = resolveClause(row, e && e.clause);
      if (!cl) {
        v.push(violation('cited_clause_unresolved', id, `literals_not_expressed clause ${e && e.clause}`));
        continue;
      }
      const raw = String((e && e.literal) ?? '');
      const uncovered = (row.uncovered_numbers || []).filter((x) => x.clause_path.startsWith(cl.path) && norm(x.token) === norm(raw));
      if (uncovered.length) {
        for (const x of uncovered) listedTokens.get(reg).add(`${x.clause_path}|${norm(raw)}`);
        counts.literals_listed++;
        continue;
      }
      const parsed = extractLiterals(` ${raw} `);
      if (parsed.length !== 1) {
        v.push(violation('literal_not_in_clause', id, `listed literal "${raw}" is not one number`));
        continue;
      }
      if (bind(parsed[0].value, parsed[0].unit, cl.path, `listed literal "${raw}"`)) counts.literals_listed++;
    }

    // application evidence
    const app = u.application && typeof u.application === 'object' ? u.application : {};
    const evidence = app.evidence && typeof app.evidence === 'object' ? app.evidence : {};
    const tokens = [
      ...(app.zones || []).map((t) => ['zone', t]),
      ...(app.building_types || []).filter((t) => t !== 'any').map((t) => ['building_type', t]),
      ...(app.lot_conditions || []).filter((t) => !GENERATED_CONDITION_TOKENS.includes(t)).map((t) => ['lot_condition', t]),
      ...(app.uses || []).map((t) => ['use', t]),
    ];
    for (const [kind, tok] of tokens) {
      const ev = evidence[tok];
      if (typeof ev !== 'string' || words(ev) < 2) {
        v.push(violation('evidence_short', id, `${kind} ${tok}: ${typeof ev === 'string' ? `"${ev}"` : 'no evidence phrase'}`));
        continue;
      }
      if (!lowText.includes(norm(ev))) {
        v.push(violation('evidence_not_in_clause', id, `${kind} ${tok}: "${ev}"`));
        continue;
      }
      const entry = kind === 'building_type' ? vocab.building_type && vocab.building_type[tok] : kind === 'lot_condition' ? vocab.lot_condition && vocab.lot_condition[tok] : null;
      const pats = entry && Array.isArray(entry.patterns) ? entry.patterns : null;
      if (pats && !pats.some((p) => norm(ev).includes(norm(p)))) v.push(violation('evidence_pattern_mismatch', id, `${kind} ${tok}: "${ev}" matches none of ${JSON.stringify(pats)}`));
    }
    if ((app.building_types || []).includes('any')) {
      const keys = new Set();
      for (const s of statements) byTypeKeys(s.expr, keys);
      const named = namedTypes(unitText, vocab).filter((t) => !keys.has(t)).sort(cmpStr);
      if (named.length) v.push(violation('any_with_named_type', id, `the clause names ${named.join(', ')}`));
    }
  }

  // accounting: every literal of a fully covered clause is used or listed; every uncovered number is listed
  for (const [reg, cov] of covered) {
    const row = index.rows.get(reg);
    const acc = accounted.get(reg);
    const excerptPaths = new Set((m39.get(reg) || []).map((r) => r.clause_path));
    const fullyCovered = (c) => row.clauses.filter((x) => x.leaf && x.path.startsWith(c.path)).every((x) => cov.has(x.path));
    const done = new Set(row.clauses.filter(fullyCovered).map((c) => c.path));
    const inExcerpt = (p) => [...excerptPaths].some((e) => p.startsWith(e));
    for (const l of row.literals) {
      if (!done.has(l.clause_path) || inExcerpt(l.clause_path) || acc.has(litKey(l))) continue;
      v.push(violation('literal_unaccounted', `${reg}#${l.clause_path}`, `"${l.raw}" is neither used by an expression nor listed in literals_not_expressed`));
    }
    for (const x of row.uncovered_numbers || []) {
      if (!done.has(x.clause_path) || listedTokens.get(reg).has(`${x.clause_path}|${norm(x.token)}`)) continue;
      v.push(violation('number_uncovered', `${reg}#${x.clause_path}`, `"${x.token}" is in no literal or exclusion span and is not listed`));
    }
    for (const r of m39.get(reg) || []) {
      for (const l of r.lits) if (!r.used.has(l.start)) v.push(violation('literal_unaccounted', r.unit_id, `enacting excerpt "${l.raw}" is neither used nor listed`));
    }
  }
  return gateResult({ violations: v, checked: counts.units, counts });
}

/** One known-bad fixture per reason code + good twins (one per pinned archetype × value-form pair), real clause text. */
export function selfTest() {
  const results = [];
  for (const f of clauseFixtures()) {
    const r = checkClause(f.input);
    const codes = [...new Set(r.violations.map((x) => x.code))];
    const ok = f.reason === null ? r.status === 'pass' : r.status === 'fail' && codes.length === 1 && codes[0] === f.reason;
    results.push({ name: f.name, expected: f.reason, got: codes, ok });
  }
  const covered = new Set(results.map((x) => x.expected).filter(Boolean));
  for (const c of REASON_CODES) if (!covered.has(c)) results.push({ name: `fixture for ${c}`, expected: c, got: [], ok: false });
  return { pass: results.every((x) => x.ok), results };
}
