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
//   headerPaths(row, clausePath) → Set(clause path)
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
//                               (a type named only as an exclusion, "other than a/an <type>", is not named — Spec 69 M-76 A1)
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
// "semi- detached" (a City line-break hyphen) reads as "semi-detached" — applied to text, evidence and patterns alike (A12)
const norm = (s) => String(s ?? '').toLowerCase().replace(/[‘’“”"]/g, '"').replace(/\s+/g, ' ').replace(/(\w)- (\w)/g, '$1-$2').trim();
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
/** Building-type names as they read in the text ("semi_detached_house" → "semi detached house"; hyphens folded). A type
 * named only as an exclusion — "other than a/an <type>" or "except [when|where|if] [located] [inside|in|within] <type>" (the article is optional), including a list "other than a <type>, <type> or a <type>" and a trailing "containing|with|having <type list>" —
 * is not named (Spec 69 M-76 A1: Spec 68 §6.4 rule 7 `any` stays allowed); the span is removed before matching. */
export function namedTypes(text, vocab) {
  const names = Object.keys(vocab.building_type || {}).filter((k) => k !== 'any').map((k) => [k, k.replace(/_/g, ' ')]);
  const alt = names.map(([, n]) => n).sort((a, b) => b.length - a.length || cmpStr(a, b)).join('|');
  const list = alt ? String.raw`(?:(?:a|an)\s+)?(?:${alt})(?![a-z])(?:(?:,\s*(?:or\s+|and\s+)?|\s+or\s+|\s+and\s+)(?:(?:a|an)\s+)?(?:${alt})(?![a-z]))*` : null;
  const lead = String.raw`(?:other than|except(?:\s+(?:when|where|if))?(?:\s+located)?(?:\s+(?:inside|in|within))?)`;
  const excl = list ? new RegExp(String.raw`${lead}\s+${list}(?:\s+(?:containing|that contains|with|having)\s+${list})?`, 'g') : null;
  const t = ` ${norm(text).replace(/-/g, ' ')} `.replace(excl || /$^/, ' ');
  const out = [];
  for (const [k, name] of names) if (new RegExp(`(?<![a-z])${name}(?![a-z])`).test(t)) out.push(k);
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

const CELL_PATH = /\[T(\d+)\.R(\d+)\.C(\d+)\]/;
/** Spec 68 section 6 (R2): a data-table cell carries its row and column headers. The clause paths of the header cells
 * whose text is the cell's row_header (the row's first cell) or one of its column_header parts (header-row cells).
 * Empty for a clause that is not a table cell. PURE. */
export function headerPaths(row, clausePath) {
  const out = new Set();
  const m = CELL_PATH.exec(clausePath);
  if (!m) return out;
  const clauses = row.clauses || [];
  const cell = clauses.find((c) => c.path === clausePath);
  if (!cell || cell.column_header === undefined) return out;
  const prefix = clausePath.slice(0, m.index);
  const tag = `[T${m[1]}.`;
  const rowH = String(cell.row_header || '').trim();
  const colH = String(cell.column_header || '').split(' / ').map((x) => x.trim()).filter(Boolean);
  for (const c of clauses) {
    if (c.path === clausePath || !c.path.startsWith(prefix + tag)) continue;
    const cm = CELL_PATH.exec(c.path);
    if (!cm) continue;
    const t = String(c.text || '').trim();
    if (rowH && cm[3] === '1' && t === rowH) out.add(c.path);
    else if (c.column_header === '' && colH.includes(t)) out.add(c.path);
  }
  return out;
}

/** Spec 68 section 6 (R2): the texts of the header cells of a table cell, followed one level further - a row-header cell is itself
 * a cell under its own column header ("500 to 1,999 square metres" under "Gross Floor Area"), so that header's text is a header of the
 * value cell too. headerPaths() (the literal-binding set) is NOT changed. Empty for a clause that is not a table cell. PURE. */
export function headerTexts(row, clausePath) {
  const byPath = new Map((row.clauses || []).map((c) => [c.path, c]));
  const seen = new Set();
  const walk = (p) => {
    for (const hp of headerPaths(row, p)) if (!seen.has(hp)) { seen.add(hp); walk(hp); }
  };
  walk(clausePath);
  return [...seen].sort(cmpStr).map((p) => String(byPath.get(p).text || '').trim()).filter(Boolean);
}

/** G-CLAUSE over the agreed units. PURE. */
/**
 * A literal is the OWN header id of a Ch.900 exception row (`900.<k>.10(N)`, k = 2..6): it sits in the row's root clause,
 * its value is N, and the row text before it is exactly "(N) Exception <ZONE> ". Anything else (the same number in the
 * body, another exception's number, a non-Ch.900 row) is not. PURE.
 */
export function isOwnExceptionHeader(row, l) {
  const m = /^900\.[2-6]\.10\((\d+)\)$/.exec(String(row && row.regulation_id));
  if (!m || !l || !row.clauses || !row.clauses.length || l.clause_path !== row.clauses[0].path) return false;
  if (l.unit !== null && l.unit !== undefined) return false;
  if (Number(l.value) !== Number(m[1]) || String(l.raw) !== m[1]) return false;
  const before = String(row.verbatim || '').slice(0, l.start);
  return new RegExp(`^\\(${m[1]}\\)\\s*Exception\\s+[A-Z]+\\s+$`).test(before);
}

export function checkClause({ slice, units = new Map(), vocab, adjudications = null } = {}) {
  const v = [];
  const index = buildIndex(slice);
  const dv = dslVocab(vocab);
  const excerpts = consolidationExcerpts(adjudications);
  const counts = { units: 0, statements: 0, literals_bound: 0, literals_listed: 0, consolidation_mismatch_units: 0, heading_duplicates: 0, exception_header_ids: 0 };
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
    // A6b: an enacting amendment row (`<citation>@<by-law>`) holds one clause of a consolidation row; that row's lead-ins
    // ("(8) … may encroach … as follows") govern it as they govern the consolidated clause (Spec 68 §9 G-CLAUSE lead-ins)
    const enactingLeadIns = [];
    if (String(reg).includes('@') && typeof row.target === 'string' && row.target.startsWith(String(row.article))) {
      const P = row.target.slice(String(row.article).length);
      const first = /^\([0-9A-Za-z]{1,7}\)/.exec(P);
      const crow = first ? index.rows.get(String(row.article) + first[0]) : null;
      if (crow) for (const c of crow.clauses || []) if (c.path !== P && P.startsWith(c.path)) enactingLeadIns.push(c.text.trim());
    }
    const unitText = excerpt !== null ? [...leadIns, excerpt].join(' ') : [...enactingLeadIns, view.text].join(' ');

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
      const hdr = headerPaths(row, clausePath); // Spec 68 section 6: a data-table cell carries its row and column headers
      const hit = row.literals.filter((l) => (scope.subtree.has(l.clause_path) || scope.ancestors.has(l.clause_path) || hdr.has(l.clause_path)) && litMatch(l, value, unit));
      if (!hit.length) {
        v.push(violation('literal_not_in_clause', id, `${what} ${value}${unit ?? ''} is not a literal of ${row.article}${clausePath}`));
        return false;
      }
      // the cited clause's own occurrence first, then a lead-in's (A13: the heading "One Storey" must not take the body's
      // "one storey"); a value bound more often than it occurs reuses one (no new fact)
      const sorted = hit.sort((a, b) => a.start - b.start);
      const free = sorted.find((l) => scope.subtree.has(l.clause_path) && !acc.has(litKey(l))) || sorted.find((l) => !acc.has(litKey(l))) || sorted[0];
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
      const cl = resolveClause(row, s.path, view.clause_path);
      if (!cl) {
        v.push(violation('cited_clause_unresolved', id, `@${s.path}`));
        continue;
      }
      for (const p of argPathsOf(s.expr)) if (!resolveClause(row, p, view.clause_path)) v.push(violation('cited_clause_unresolved', id, `argument @${p}`));
      for (const { lit, path } of boundLiterals(s.expr, null)) {
        const at = path ? resolveClause(row, path, view.clause_path) : cl;
        if (!at) continue; // reported above
        if (bind(lit.value, lit.unit, at.path, 'expression literal')) counts.literals_bound++;
      }
    }
    // M-242 (N-3, operator approved 2026-10-20): complement(<sibling>, …) is licensed by a complement phrase in the unit's own
    // text (vocab.complement_phrases); its literals bind to, and its variables are licensed by, each sibling's own clause
    if (cond && cond.type === 'complement') {
      const phrases = (vocab && vocab.complement_phrases && vocab.complement_phrases.phrases) || [];
      if (!phrases.some((p) => norm(view.text).includes(norm(p)))) v.push(violation('variable_unlicensed', id, `complement(…) needs a complement phrase (${phrases.join(' / ')}) in the clause`));
      cond.of.forEach((sid, k) => {
        const sib = units.get(sid);
        const sv = sib ? unitView(index, sid) : null;
        if (!sib || !sv || sv.row.regulation_id !== reg) { v.push(violation('cited_clause_unresolved', id, `complement sibling ${sid} is not an agreed unit of ${row.article}`)); return; }
        const sif = (u.condition.complement_if || [])[k] ?? (sib.condition && sib.condition.if);
        let sc = null;
        try { sc = typeof sif === 'string' && sif !== 'none' ? parseCond(sif) : null; } catch (err) { if (!(err instanceof DslError)) throw err; }
        if (!sc || sc.type === 'complement') { v.push(violation('cited_clause_unresolved', id, `complement sibling ${sid} has no keyed condition`)); return; }
        for (const e of conditionUnitErrors(sc, dv)) v.push(violation('unit_binding', id, `complement condition: ${e}`));
        for (const { lit } of boundLiterals(sc, null)) if (bind(lit.value, lit.unit, sv.clause_path, `complement literal (${sid})`)) counts.literals_bound++;
        const sLead = row.clauses.filter((c) => c.path !== sv.clause_path && sv.clause_path.startsWith(c.path)).map((c) => c.text.trim());
        const sLic = norm([...sLead, sv.text, ...headerTexts(row, sv.clause_path)].join(' '));
        for (const name of [...variablesOf(sc)].sort(cmpStr)) {
          const ps = licensePhrases(vocab, name);
          if (ps === null) continue;
          if (!ps.length) v.push(violation('variable_unlicensed', id, `${name}: vocab declares no licensing phrase`));
          else if (!ps.some((p) => sLic.includes(norm(p)))) v.push(violation('variable_unlicensed', id, `${name}: none of ${JSON.stringify(ps)} occurs in the complemented clause ${sid}`));
        }
      });
    } else if (cond) {
      for (const x of variablesOf(cond)) vars.add(x);
      for (const e of conditionUnitErrors(cond, dv)) v.push(violation('unit_binding', id, `condition: ${e}`));
      for (const { lit } of boundLiterals(cond, null)) if (bind(lit.value, lit.unit, view.clause_path, 'condition literal')) counts.literals_bound++;
    }

    // M-241: a holds(<token>) condition (in a statement's if or in condition.if) is licensed by the token's vocab patterns
    const holdsTokens = new Set();
    const walkHolds = (n) => { if (!n || typeof n !== 'object') return; if (n.type === 'holds') holdsTokens.add(n.token); for (const k of Object.keys(n)) { const x = n[k]; if (Array.isArray(x)) x.forEach(walkHolds); else if (x && typeof x === 'object') walkHolds(x); } };
    for (const s of statements) walkHolds(s.expr);
    if (cond) walkHolds(cond);
    // licensing
    const lowText = norm(unitText);
    const licText = norm([unitText, ...headerTexts(row, view.clause_path)].join(' ')); // Spec 68 section 6: a table cell carries its row and column headers (licensing only)
    for (const tok of [...holdsTokens].sort(cmpStr)) {
      const lc = vocab && vocab.lot_condition && vocab.lot_condition[tok];
      const ps = (lc && lc.patterns) || [];
      if (!lc) v.push(violation('unit_binding', id, `holds(${tok}): not a vocab lot_condition token`));
      else if (!ps.length) v.push(violation('variable_unlicensed', id, `holds(${tok}): vocab declares no licensing phrase`));
      else if (!ps.some((p) => licText.includes(norm(p)))) v.push(violation('variable_unlicensed', id, `holds(${tok}): none of ${JSON.stringify(ps)} occurs in the clause`));
    }
    for (const name of [...vars].sort(cmpStr)) {
      const phrases = licensePhrases(vocab, name);
      if (phrases === null) continue; // unknown variable → unit_binding
      if (!phrases.length) v.push(violation('variable_unlicensed', id, `${name}: vocab declares no licensing phrase`));
      else if (!phrases.some((p) => licText.includes(norm(p)))) v.push(violation('variable_unlicensed', id, `${name}: none of ${JSON.stringify(phrases)} occurs in the clause`));
    }

    // literals_not_expressed
    for (const e of Array.isArray(u.literals_not_expressed) ? u.literals_not_expressed : []) {
      const cl = resolveClause(row, e && e.clause, view.clause_path);
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
      // A13: the regulation's title-case heading ("(2) One Storey Extension … 12.0 Metres") repeats a value its body states;
      // once an equal body occurrence is bound, the heading duplicate is accounted (counted), never a second fact
      if (/[A-Z]/.test(l.raw) && row.clauses.length && l.clause_path === row.clauses[0].path && row.literals.some((o) => o !== l && acc.has(litKey(o)) && sameValue(o.value, l.value) && (o.unit ?? null) === (l.unit ?? null))) {
        counts.heading_duplicates++;
        continue;
      }
      // orchestrator 2026-10-14 Q-E = b (narrow): a Ch.900 exception's OWN header id ("(N) Exception <ZONE> N") is a
      // regulation number, which the brief says to ignore — exempt and counted; every other number still accounts
      if (isOwnExceptionHeader(row, l)) {
        counts.exception_header_ids++;
        continue;
      }
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
