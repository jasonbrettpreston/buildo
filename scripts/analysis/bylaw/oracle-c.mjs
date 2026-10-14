// McBylaw oracle C — the Phase 1 table vs the REQUIRED value of a CoA decision-notice item (PURE: no I/O).
//
// Plan: .cursor/mcbylaw/oracle-c-harness-plan.md (phase2-plan-v2 §V-2 row C, register D6, P2-12; Spec 129 §6/§8/§16).
// * Citation-first (Spec 129 §16, operator 2026-10-09, Path 2): the topic comes from the cited 569-2013 section joined to
//   the table; the notice's keyword target is a tiebreak and a cross-check only.
// * Only the by-law side is compared (plan §V-2: C validates the required value; the proposed side is never read).
// * Independence (plan §V-2 R-ORACLE): this module reads the table's JSON shapes directly. It imports nothing from the
//   evaluator (evaluate.mjs / dsl.mjs), authored.mjs (which imports the evaluator) or oracle B. Locked by
//   src/tests/bylaw-oracle-c.logic.test.ts.
// * Determinism (Spec 68 §10 lock): no clock, no randomness; every output list is sorted.

export const ORACLE_C_VERSION = 'oracle-c-2'; // round 2: pre-registration .cursor/mcbylaw/oracle-c/prereg-round-2.txt (R2-1 … R2-8)

export const ANSWERS = Object.freeze(['match', 'mismatch', 'not_comparable']);

// Closed not_comparable reasons, in evaluation order (the first that applies wins). Spec 129 D8 set ∪ plan D6 set ∪
// the PROPOSED additions below (vocab proposals for the operator, not rulings).
export const REASONS = Object.freeze([
  'citation_absent', 'former_bylaw', 'exception_cited', 'parse_failed', 'row_not_in_table', 'row_out_of_scope', 'row_pending',
  'clause_not_in_table', 'target_not_modelled', 'target_ambiguous', 'law_changed_after_hearing', 'amendment_status_unverified',
  'citation_condition_conflict', 'zone_unparsed', 'zone_label_missing', 'lot_input_required', 'lot_input_unavailable', 'branch_unresolved',
]);
// lot_input_unavailable is always written with its input: lot_input_unavailable:<input> (R2-5 closed set)
export const LOT_INPUTS_UNAVAILABLE = Object.freeze([
  'parcel_link', 'overlay', 'height', 'abutments', 'cross_target', 'building_type', 'dwelling_units', 'townhouse_unit_width',
  'platform_height', 'existing_building', 'other',
]);
export const LINK_STATUSES = Object.freeze(['ambiguous', 'linked_unique', 'unlinked']);
export const LINK_PROXY = Object.freeze(['class_match', 'class_mismatch', 'component_mismatch_dated', 'not_comparable']); // = coa-zoning-designation LINK_ANSWERS
export const BAND_MARGIN = 0.05; // R2-4: a measured lot input within 5 % (relative) of a threshold decides nothing
export const PROPOSED_REASONS = Object.freeze([
  'citation_condition_conflict', 'lot_input_unavailable',
  'citation_absent', 'exception_cited', 'row_out_of_scope', 'row_pending', 'clause_not_in_table', 'target_ambiguous',
  'zone_label_missing', 'lot_input_required', 'branch_unresolved',
]);
// D6 reasons this round cannot produce (no parcel link in round 1): reported as not_run.
export const REASONS_NOT_RUN = Object.freeze(['lot_gate']);

// plan register D6: a coa_mismatch names the wrong side. Proposals only; the operator adjudicates.
export const ADJ_KINDS = Object.freeze(['table', 'parse', 'link', 'law_change']);

// Notice unit (Spec 129 vocab) and table unit (Spec 68 vocab dsl_target) → comparable family + factor to canonical.
export const UNIT_FAMILY = Object.freeze({
  m: ['length', 1], cm: ['length', 0.01], m2: ['area', 1], pct: ['pct', 1], ratio: ['ratio', 1],
  storeys: ['storeys', 1], spaces: ['count', 1], units: ['count', 1],
});
export const TOLERANCE = 0.0005; // canonical units; a notice states at most 2 decimals

const LABEL_VARS = Object.freeze({ required_lot_frontage_m: 'f', required_lot_area_m2: 'a' });
const LOT_VARS = Object.freeze(['lot_frontage_m', 'lot_depth_m', 'lot_area_m2']); // R2-4: from the uniquely linked parcel
const cmpStr = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const fmtNum = (v) => String(Math.round(v * 10000) / 10000);

// ------------------------------------------------------------------ citation and clause paths

/** '10.20.40.10(2)(B)(ii)' → {article, regulation_id: '10.20.40.10(2)', clause_path: '(2)(B)(ii)'}; null if unparsable. */
export function splitCitation(cited) {
  const m = /^(\d+(?:\.\d+)+)((?:\([^()\s]+\))*)$/.exec(String(cited || '').trim());
  if (!m) return null;
  const tokens = m[2].match(/\([^()]+\)/g) || [];
  return { article: m[1], regulation_id: tokens.length ? `${m[1]}${tokens[0]}` : `${m[1]}#article`, clause_path: tokens.join('') };
}

const pathTokens = (p) => String(p || '').match(/\([^()]*\)|\[[^\]]*\]/g) || [];

/** Token-prefix compatibility in either direction ('(1)' is not a prefix of '(10)'). */
export function pathCompatible(a, b) {
  const x = pathTokens(a);
  const y = pathTokens(b);
  const n = Math.min(x.length, y.length);
  for (let i = 0; i < n; i += 1) if (x[i] !== y[i]) return false;
  return true;
}

// ------------------------------------------------------------------ table side

/** One numeric_expression statement → {target, form, value?, unit?, key?, tag}. form ∈ literal|label|no_limit|lot_dependent. */
export function parseStatement(stmt) {
  const s = String(stmt || '').trim();
  const eq = s.indexOf(' = ');
  if (eq < 0) return null;
  const target = s.slice(0, eq).trim();
  let rhs = s.slice(eq + 3).trim();
  let tag = null;
  const at = rhs.lastIndexOf(' @');
  if (at >= 0 && !rhs.slice(at + 2).includes(' ')) { tag = rhs.slice(at + 2); rhs = rhs.slice(0, at).trim(); }
  let m = /^(\d+(?:\.\d+)?) (m|m2|pct|ratio|storeys|units|spaces)$/.exec(rhs);
  if (m) return { target, form: 'literal', value: Number(m[1]), unit: m[2], tag, expr: rhs };
  m = /^label\(([a-z])\)$/.exec(rhs);
  if (m) return { target, form: 'label', key: m[1], tag, expr: rhs };
  if (rhs === 'unlimited' || rhs === 'unregulated') return { target, form: 'no_limit', tag, expr: rhs };
  return { target, form: 'lot_dependent', tag, expr: rhs };
}

function adjIndex(adjudications) {
  const superseded = new Set(adjudications.filter((r) => r && r.supersedes).map((r) => r.supersedes));
  const corr = new Map();
  const dis = new Map();
  const sorted = [...adjudications].filter(Boolean).sort((p, q) => cmpStr(String(p.id), String(q.id)));
  for (const r of sorted) {
    const k = `${r.unit}\u0000${r.field}`;
    if (r.kind === 'correction' && !superseded.has(r.id)) corr.set(k, r);
    if (r.kind === 'disagreement') dis.set(k, r);
  }
  return { corr, dis };
}

function getPath(obj, p) {
  let cur = obj;
  for (const part of p.split('.')) { if (cur == null || typeof cur !== 'object') return undefined; cur = cur[part]; }
  return cur;
}

/** The agreed value of a field: live correction > disagreement decision (a | b | value) > keyer A. */
function agreed(unitId, field, a, b, idx) {
  const c = idx.corr.get(`${unitId}\u0000${field}`);
  if (c) return { value: c.value, source: `correction:${c.id}` };
  if (field.includes('.')) {
    const parent = field.split('.')[0];
    const cp = idx.corr.get(`${unitId}\u0000${parent}`);
    if (cp) return { value: getPath({ [parent]: cp.value }, field), source: `correction:${cp.id}` };
  }
  const d = idx.dis.get(`${unitId}\u0000${field}`);
  if (d) {
    if (d.decision === 'b') return { value: getPath(b || {}, field), source: `disagreement:${d.id}:b` };
    if (d.decision === 'value') return { value: d.value, source: `disagreement:${d.id}:value` };
    return { value: getPath(a || {}, field), source: `disagreement:${d.id}:a` };
  }
  return { value: getPath(a || {}, field), source: 'agreed' };
}

const generation = (key) => { const m = /~r([1-9]\d*)$/.exec(String(key)); return m ? Number(m[1]) : 0; };

/**
 * Build the comparison view of the table.
 * @param {{provisions:{rows:object[]}, shards:{key:string,a:object|null,b:object|null}[], adjudications:object[], targets:object}} input
 *   targets = vocab.json dsl_target (target → {unit}).
 * @returns {{rows: Map<string, object>}} regulation_id → {regulation_id, scope, row_status, amendments, units[]}
 */
export function buildTable({ provisions, shards, adjudications = [], targets = {} }) {
  const idx = adjIndex(adjudications);
  const newest = new Map(); // unit_id → {gen, a, b}
  for (const s of [...shards].sort((p, q) => cmpStr(p.key, q.key))) {
    const gen = generation(s.key);
    const bById = new Map(((s.b && s.b.units) || []).filter((u) => u && u.unit_id).map((u) => [u.unit_id, u]));
    for (const a of ((s.a && s.a.units) || [])) {
      if (!a || typeof a.unit_id !== 'string') continue;
      const prev = newest.get(a.unit_id);
      if (!prev || gen > prev.gen) newest.set(a.unit_id, { gen, a, b: bById.get(a.unit_id) || null, shard: s.key });
    }
  }
  const rows = new Map();
  for (const r of provisions.rows || []) {
    rows.set(r.regulation_id, {
      regulation_id: r.regulation_id, scope: r.scope, row_status: r.row_status,
      amendments: (r.amendments || []).map((t) => ({ bylaw: t.bylaw, clause_path: t.clause_path, qualifier: t.qualifier || null })), units: [],
      clauses: (r.clauses || []).map((c) => ({ path: c.path, leaf: Boolean(c.leaf) })), verbatim_tail: String(r.verbatim || '').slice(-300),
    });
  }
  for (const [unitId, { a, b, shard }] of [...newest.entries()].sort((p, q) => cmpStr(p[0], q[0]))) {
    const hash = unitId.indexOf('#');
    const regId = unitId.slice(0, hash);
    const row = rows.get(regId);
    if (!row) continue;
    const local = unitId.slice(hash + 1);
    const root = (regId.match(/\([^()]+\)$/) || [''])[0];
    const pathOf = local === 'whole' ? root : local;
    const expr = agreed(unitId, 'numeric_expression', a, b, idx).value;
    const statements = (Array.isArray(expr) ? expr : []).map(parseStatement).filter((st) => st && targets[st.target]);
    row.units.push({
      unit_id: unitId, path: pathOf, shard,
      archetype: agreed(unitId, 'archetype', a, b, idx).value,
      bound: agreed(unitId, 'bound', a, b, idx).value,
      condition: agreed(unitId, 'condition', a, b, idx).value,
      statements: statements.map((st) => ({ ...st, target_unit: targets[st.target].unit })),
    });
  }
  return { rows };
}

// ------------------------------------------------------------------ conditions (three-valued)

/** cond = 'none' | {tokens, if?}. facts = {label:{f,a,d,u}}. Returns true | false | null (unknown). */
export function evalCondition(cond, facts) {
  if (cond == null || cond === 'none') return true;
  if (typeof cond !== 'object' || typeof cond.if !== 'string' || !cond.if.trim()) return null;
  const or = cond.if.split(/\s+or\s+/).map((conj) => {
    const vals = conj.split(/\s+and\s+/).map((atom) => evalAtom(atom.trim(), facts));
    if (vals.includes(false)) return false;
    return vals.includes(null) ? null : true;
  });
  if (or.includes(true)) return true;
  return or.includes(null) ? null : false;
}

function evalAtom(atom, facts) {
  const label = (facts && facts.label) || {};
  let m = /^(not\s+)?labelled\(([a-z])\)$/.exec(atom);
  if (m) {
    if (!facts || !facts.zone_parsed) return null;
    const has = label[m[2]] != null;
    // a truncated string, or one with no parameter group at all (class-only / prose), states no label facts
    if (!has && (facts.zone_truncated || facts.zone_class_only)) return null;
    return m[1] ? !has : has;
  }
  m = /^(\w+)\s*(<|≤|>|≥|=)\s*(\d+(?:\.\d+)?)\s*\w*$/.exec(atom);
  if (m && LABEL_VARS[m[1]]) {
    const v = label[LABEL_VARS[m[1]]];
    if (v == null) return null;
    const n = Number(m[3]);
    return { '<': v < n, '≤': v <= n, '>': v > n, '≥': v >= n, '=': v === n }[m[2]];
  }
  if (m && LOT_VARS.includes(m[1])) {
    const v = facts && facts.lot ? facts.lot[m[1]] : null;
    if (v == null) return null;
    const n = Number(m[3]);
    if (Math.abs(v - n) <= BAND_MARGIN * n) return null; // R2-4: a measured input near a threshold decides nothing
    return { '<': v < n, '≤': v <= n, '>': v > n, '≥': v >= n, '=': false }[m[2]];
  }
  return null;
}

// ------------------------------------------------------------------ D8 law at the hearing date

/**
 * Spec 129 §8: every tag on the candidate units' clause subtree needs a verified status in force on or before the
 * hearing date. Returns null (comparable) or {reason, basis, bylaws}. Proposed refinement: an unverified by-law whose
 * number year (NNNN-YYYY) is after the hearing year is law_changed_after_hearing with basis bylaw_number_year.
 */
const MONTHS = Object.freeze({ Jan: '01', Feb: '02', Mar: '03', Apr: '04', May: '05', Jun: '06', Jul: '07', Aug: '08', Sep: '09', Oct: '10', Nov: '11', Dec: '12' });

export function lawAtHearing(tags, statuses, hearingDate) {
  const changed = [];
  const changedByOrder = [];
  const changedByYear = [];
  const unverified = [];
  const year = Number(String(hearingDate).slice(0, 4));
  const month = String(hearingDate).slice(0, 7);
  const byKey = new Map();
  for (const t of tags) byKey.set(t.bylaw || `order:${t.qualifier || 'unknown'}`, t);
  for (const key of [...byKey.keys()].sort(cmpStr)) {
    const t = byKey.get(key);
    if (!t.bylaw) {
      // R2-6: a numberless tag (a tribunal order, e.g. "PL130592 Mar_2018") is dated by its qualifier
      const q = /(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*[_ ](\d{4})/.exec(String(t.qualifier || ''));
      if (q && `${q[2]}-${MONTHS[q[1]]}` > month) changedByOrder.push(key);
      else unverified.push(key);
      continue;
    }
    const st = statuses[t.bylaw] || { status: 'not_verified' };
    const date = st.in_force_on || (st.in_force_trigger ? st.enacted_on : null);
    if (st.status === 'in_force' && date) { if (date > hearingDate) changed.push(key); continue; }
    const y = /-(\d{4})$/.exec(t.bylaw);
    if (y && Number(y[1]) > year) changedByYear.push(key);
    else unverified.push(key);
  }
  const all = [...changed, ...changedByOrder, ...changedByYear];
  if (changed.length) return { reason: 'law_changed_after_hearing', basis: 'verified_in_force_on', bylaws: all };
  if (changedByOrder.length) return { reason: 'law_changed_after_hearing', basis: 'order_qualifier_date', bylaws: all };
  if (changedByYear.length) return { reason: 'law_changed_after_hearing', basis: 'bylaw_number_year', bylaws: all };
  if (unverified.length) return { reason: 'amendment_status_unverified', basis: 'not_verified', bylaws: unverified };
  return null;
}

/**
 * R2-2 (C-6 (a)): the tags of a MULTI-leaf regulation printed by the City as the last bracket group of its verbatim
 * and bound by the slicer to the last clause. For law-at-date they are regulation-level. Returns their keys, sorted.
 */
export function endOfRegulationTags(row) {
  const leaves = (row.clauses || []).filter((c) => c.leaf);
  if (leaves.length < 2) return [];
  const m = /\[\s*By-law:\s*([^\]]+?)\s*\]\s*$/.exec(String(row.verbatim_tail || ''));
  if (!m) return [];
  const printed = m[1];
  const last = leaves[leaves.length - 1].path;
  const keys = row.amendments
    .filter((t) => t.clause_path === last && (t.bylaw || t.qualifier) && printed.includes(t.bylaw || t.qualifier))
    .map((t) => t.bylaw || `order:${t.qualifier}`);
  return [...new Set(keys)].sort(cmpStr);
}

/** R2-2 census: complete in-scope rows that rely on the end-of-regulation reading, and their tags. */
export function endTagCensus(table) {
  const rows = [];
  for (const row of [...table.rows.values()].sort((p, q) => cmpStr(p.regulation_id, q.regulation_id))) {
    if (row.scope !== 'in_scope' || row.row_status !== 'complete') continue;
    const keys = endOfRegulationTags(row);
    if (keys.length) rows.push({ regulation_id: row.regulation_id, tags: keys });
  }
  const multiLeafTagged = [...table.rows.values()].filter((r) => r.scope === 'in_scope' && r.row_status === 'complete'
    && r.clauses.filter((c) => c.leaf).length > 1 && r.amendments.length).length;
  return { rows_relying: rows.length, complete_multi_leaf_rows_with_tags: multiLeafTagged, rows };
}

// ------------------------------------------------------------------ one item

/** A zone string cut by the PDF line wrap: unbalanced brackets or a trailing separator. */
export function zoneIsTruncated(raw) {
  const s = String(raw || '').trim();
  if (!s) return false;
  const open = (s.match(/[([]/g) || []).length;
  const close = (s.match(/[)\]]/g) || []).length;
  return open > close || /[;,&/(-]$/.test(s);
}

/**
 * A condition token naming the NON-application of another, lot-dependent provision (vocab lot_condition
 * `*_not_applicable`, e.g. front_averaging_not_applicable ↔ 10.5.40.70(1) front-yard averaging). Examiners cite the zone
 * clause while stating the displacing provision's value, so citing the clause cannot presume this condition: the unit's
 * value is lot-dependent (PROPOSED rule, round-1 finding: 166 of 184 front-setback comparisons stated an averaged value).
 */
export function displacedByLotInput(cond) {
  return Boolean(cond && typeof cond === 'object' && Array.isArray(cond.tokens) && cond.tokens.some((t) => /_not_applicable$/.test(String(t))));
}

function zoneClassOf(z) {
  if (!z || !z.class) return z && z.status === 'former_bylaw' ? 'former_bylaw_label' : 'unparsed';
  return ['R', 'RD', 'RS', 'RT', 'RM'].includes(z.class) ? z.class : 'other_569';
}

/** R2-5: the first input outside round 2's inputs that an expression needs (closed LOT_INPUTS_UNAVAILABLE). */
export function unavailableInput(expr, linked) {
  const e = String(expr);
  if (/overlay\(/.test(e)) return 'overlay';
  if (/existing\(/.test(e)) return 'existing_building';
  if (/abutting_/.test(e)) return 'abutments';
  if (/townhouse_unit_width_m/.test(e)) return 'townhouse_unit_width';
  if (/platform_height_m/.test(e)) return 'platform_height';
  if (/\b(proposed_)?height_m\b/.test(e)) return 'height';
  if (/dwelling_units/.test(e)) return 'dwelling_units';
  if (/by_type\(|building_type/.test(e)) return 'building_type';
  if (/\b(front|rear|side)_setback_m\b|side_setback_street_m/.test(e)) return 'cross_target';
  if (/\blot_(frontage|depth|area)_m2?\b/.test(e) && !linked) return 'parcel_link';
  return 'other';
}

const stripTag = (x) => x.replace(/\s*@\S+\s*$/, '').trim();

/**
 * R2-4: a greater-of / lesser-of of one literal and one `<k> pct × <lot var>` / `<k> × <lot var>` operand, decided by the
 * linked parcel. Returns {kind: 'literal', value, unit} | {kind: 'lot_governs'} | {kind: 'unknown'} | {kind: 'unavailable', input}.
 * The lot-derived number is never returned as a value (inputs select, they are never compared).
 */
export function governing(expr, facts) {
  const linked = Boolean(facts && facts.lot);
  const m = /^(max|min)\((.*)\)$/.exec(String(expr).trim());
  const parts = m ? m[2].split(';').map(stripTag) : [];
  if (parts.length !== 2) return { kind: 'unavailable', input: unavailableInput(expr, linked) };
  let lit = null;
  let lotPart = null;
  for (const p of parts) {
    const l = /^(\d+(?:\.\d+)?) (m|m2|pct|ratio)$/.exec(p);
    const v = /^(\d+(?:\.\d+)?)\s*(pct|ratio)?\s*×\s*(lot_frontage_m|lot_depth_m|lot_area_m2)$/.exec(p);
    if (l) lit = { value: Number(l[1]), unit: l[2] };
    else if (v) lotPart = { factor: Number(v[1]) * (v[2] === 'pct' ? 0.01 : 1), input: v[3] };
  }
  if (!lit || !lotPart) return { kind: 'unavailable', input: unavailableInput(expr, linked) };
  if (!linked || facts.lot[lotPart.input] == null) return { kind: 'unavailable', input: 'parcel_link' };
  const L = lotPart.factor * facts.lot[lotPart.input];
  const lo = lit.value * (1 - BAND_MARGIN);
  const hi = lit.value * (1 + BAND_MARGIN);
  if (m[1] === 'max') return L < lo ? { kind: 'literal', ...lit } : L > hi ? { kind: 'lot_governs' } : { kind: 'unknown' };
  return L > hi ? { kind: 'literal', ...lit } : L < lo ? { kind: 'lot_governs' } : { kind: 'unknown' };
}

/** The sibling unit (same row and target) whose max()/min() holds `u` as an operand (`@<u.path>` on an operand). */
function holderOf(row, u, target) {
  const esc = u.path.replace(/[()[\].]/g, (c) => `\\${c}`);
  const re = new RegExp(`@${esc}\\s*[;)]`);
  for (const h of row.units) {
    if (h.unit_id === u.unit_id) continue;
    for (const st of h.statements) if (st.target === target && /^(max|min)\(/.test(st.expr) && re.test(st.expr)) return { u: h, st };
  }
  return null;
}

/**
 * Compare one coa_notice_variances row with the table.
 * @param {object} item  the row (snake_case columns; required_value numeric); round 2 adds item.lot =
 *   {link_status, lot_frontage_m, lot_depth_m, lot_area_m2, corner_lot} and item.link_proxy (runner, D7 link)
 * @param {{table, statuses, targets, parseZone}} ctx
 */
export function compareItem(item, ctx) {
  const z = ctx.parseZone(item.zoning_as_stated);
  const zoneParsed = Boolean(z && z.class);
  const zoneTruncated = zoneIsTruncated(item.zoning_as_stated);
  const lotIn = item.lot || { link_status: 'unlinked' };
  const linked = lotIn.link_status === 'linked_unique';
  const base = {
    variance_key: item.variance_key, application_number: item.application_number, hearing_date: item.hearing_date,
    cited: item.regulation_id_as_cited || null, zone_class: zoneClassOf(z), qualified: Boolean(item.qualified),
    zone_truncated: zoneTruncated, has_exception_ref: Boolean(item.exception_ref), keyword_target: item.target_status === 'mapped' ? item.target : null,
    notice_value: item.required_value == null ? null : Number(item.required_value), notice_unit: item.required_unit || null,
    link_status: LINK_STATUSES.includes(lotIn.link_status) ? lotIn.link_status : 'unlinked', link_proxy: item.link_proxy || null,
  };
  const nc = (reason, extra = {}) => ({ ...base, target: base.keyword_target, answer: 'not_comparable', reason, ...extra });

  if (!item.cited_bylaw) return nc('citation_absent');
  // R2-6: a former-section citation form is a former by-law citation, whatever by-law number the parser attached
  if (item.cited_bylaw !== '569-2013' || item.citation_kind === 'former_bylaw_section') return nc('former_bylaw');
  if (item.citation_kind !== 'chapter_regulation' || !item.regulation_id_as_cited) return nc('exception_cited');
  const fam = UNIT_FAMILY[item.required_unit];
  if (item.parse_status !== 'pair' || item.required_value == null || !fam) return nc('parse_failed');
  const noticeCanon = Number(item.required_value) * fam[1];

  const cit = splitCitation(item.regulation_id_as_cited);
  const row = cit && (ctx.table.rows.get(cit.regulation_id) || ctx.table.rows.get(`${cit.article}#article`));
  if (!row) return nc('row_not_in_table');
  const rowBase = { regulation_id: row.regulation_id };
  if (row.scope !== 'in_scope') return nc('row_out_of_scope', rowBase);
  if (row.row_status !== 'complete') return nc('row_pending', rowBase);
  // R2-7: the cited clause must exist in the row (a #whole unit never swallows a clause the row does not have)
  const citedDepth = pathTokens(cit.clause_path).length;
  const clauses = row.clauses || [];
  if (citedDepth && clauses.length && !clauses.some((c) => pathCompatible(c.path, cit.clause_path) && pathTokens(c.path).length >= citedDepth)) {
    return nc('clause_not_in_table', rowBase);
  }

  const compatible = row.units.filter((u) => pathCompatible(u.path, cit.clause_path));
  if (!compatible.length) return nc('clause_not_in_table', rowBase);
  let branches = [];
  for (const u of compatible) {
    for (const st of u.statements) {
      if (!(UNIT_FAMILY[st.target_unit] && UNIT_FAMILY[st.target_unit][0] === fam[0])) continue;
      // R2-7: a statement tagged to a clause incompatible with the citation is not a candidate
      if (st.tag && st.tag.startsWith('(') && !pathCompatible(st.tag, cit.clause_path)) continue;
      branches.push({ u, st });
    }
  }
  if (!branches.length) return nc('target_not_modelled', rowBase);
  const targets = [...new Set(branches.map((b) => b.st.target))].sort(cmpStr);
  if (targets.length > 1) {
    if (base.keyword_target && targets.includes(base.keyword_target)) branches = branches.filter((b) => b.st.target === base.keyword_target);
    else return nc('target_ambiguous', { ...rowBase, table_targets: targets });
  }
  const target = branches[0].st.target;
  // R2-1 (b): a unit that is one operand of a sibling's greater-of / lesser-of is replaced by the governing expression
  const seen = new Set();
  branches = branches.map((b) => (b.st.form === 'literal' ? holderOf(row, b.u, target) || b : b))
    .filter((b) => { const k = `${b.u.unit_id}|${b.st.expr}`; if (seen.has(k)) return false; seen.add(k); return true; });
  const unitIds = [...new Set(branches.map((b) => b.u.unit_id))].sort(cmpStr);
  // D8 sensitivity (diagnostic only): every tag on the row applies
  const rowLaw = lawAtHearing(row.amendments, ctx.statuses, item.hearing_date);
  const tbl = { ...rowBase, target, unit_ids: unitIds, bound_table: [...new Set(branches.map((b) => b.u.bound))].sort(cmpStr).join('|') || null,
    d8_row_level: rowLaw ? rowLaw.reason : 'comparable' };

  // D8 with R2-2: subtree tags plus the regulation-level end-of-regulation tags
  const endKeys = endOfRegulationTags(row);
  const keyOf = (t) => t.bylaw || `order:${t.qualifier}`;
  const subtree = row.amendments.filter((t) => branches.some((b) => pathCompatible(t.clause_path, b.u.path)));
  const tags = [...subtree, ...row.amendments.filter((t) => endKeys.includes(keyOf(t)) && !subtree.includes(t))];
  const law = lawAtHearing(tags, ctx.statuses, item.hearing_date);
  if (law) {
    const subtreeKeys = new Set(subtree.map(keyOf));
    const d8EndTag = law.bylaws.some((k) => endKeys.includes(k) && !subtreeKeys.has(k));
    return { ...base, ...tbl, answer: 'not_comparable', reason: law.reason, d8_basis: law.basis, d8_bylaws: law.bylaws, d8_end_tag: d8EndTag };
  }

  // branch selection: a single candidate is pinned by the citation (its condition presumed, R2-1 exceptions);
  // otherwise three-valued on label facts and the linked parcel's inputs. A label absent from a TRUNCATED zone string is
  // unknown, never "not labelled".
  const labelFacts = { zone_parsed: zoneParsed, zone_truncated: zoneTruncated, zone_class_only: Boolean(z && z.status !== 'full_569'), label: zoneParsed ? { f: z.f, a: z.a, u: z.u, d: z.d } : {} };
  const facts = { ...labelFacts, lot: linked ? lotIn : null };
  if (branches.length === 1) {
    // R2-1 (c): a pinned unit whose condition is false on the notice's own label facts
    if (!displacedByLotInput(branches[0].u.condition) && evalCondition(branches[0].u.condition, labelFacts) === false) {
      return { ...base, ...tbl, answer: 'not_comparable', reason: 'citation_condition_conflict' };
    }
  } else {
    const kept = branches.filter((b) => evalCondition(b.u.condition, facts) !== false);
    if (kept.length) branches = kept;
  }
  const values = [];
  const unresolved = new Set();
  let unavailable = null;
  for (const b of branches) {
    const st = b.st;
    if (displacedByLotInput(b.u.condition)) unresolved.add('lot_input_required');
    else if (st.form === 'literal') values.push({ canon: st.value * UNIT_FAMILY[st.unit][1], show: `${fmtNum(st.value)} ${st.unit}` });
    else if (st.form === 'no_limit') values.push({ canon: null, show: st.expr });
    else if (st.form === 'label') {
      if (!zoneParsed) unresolved.add('zone_unparsed');
      else if (z[st.key] == null) unresolved.add('zone_label_missing'); // incl. a label lost to a truncated zone string
      else values.push({ canon: z[st.key] * UNIT_FAMILY[st.target_unit][1], show: `${fmtNum(z[st.key])} ${st.target_unit}`, via_label: st.key });
    } else {
      const g = governing(st.expr, facts);
      if (g.kind === 'literal') values.push({ canon: g.value * UNIT_FAMILY[g.unit][1], show: `${fmtNum(g.value)} ${g.unit}`, via_lot: true });
      else if (g.kind === 'lot_governs') unresolved.add('lot_input_required');
      else if (g.kind === 'unknown') unresolved.add('branch_unresolved');
      else { unresolved.add('lot_input_unavailable'); if (!unavailable || cmpStr(g.input, unavailable) < 0) unavailable = g.input; }
    }
  }
  const sel = { ...tbl, unit_ids: [...new Set(branches.map((b) => b.u.unit_id))].sort(cmpStr) };
  for (const r of ['zone_unparsed', 'zone_label_missing', 'lot_input_required', 'lot_input_unavailable']) {
    if (unresolved.has(r)) {
      return { ...base, ...sel, answer: 'not_comparable', reason: r === 'lot_input_unavailable' ? `${r}:${unavailable}` : r };
    }
  }
  const distinct = [...new Map(values.map((v) => [v.canon === null ? `none:${v.show}` : fmtNum(v.canon), v])).values()];
  const eq = (v) => v.canon !== null && Math.abs(v.canon - noticeCanon) < TOLERANCE;
  if (distinct.length > 1 || unresolved.has('branch_unresolved')) {
    return { ...base, ...sel, answer: 'not_comparable', reason: 'branch_unresolved', in_branch_set: distinct.some(eq),
      table_values: distinct.map((v) => v.show).sort(cmpStr) };
  }
  const v = distinct[0];
  // literals of the same family equal to the notice value elsewhere: another target in the selected unit (input to the
  // 'parse' proposal: the keyword target picked the wrong statement) or another unit of the row ('link' proposal)
  const siblings = [];
  const otherTargets = [];
  for (const u of row.units) {
    const own = sel.unit_ids.includes(u.unit_id);
    for (const st of u.statements) {
      if (own && st.target === target) continue;
      if (st.form === 'literal' && UNIT_FAMILY[st.unit] && UNIT_FAMILY[st.unit][0] === fam[0] && Math.abs(st.value * UNIT_FAMILY[st.unit][1] - noticeCanon) < TOLERANCE) (own ? otherTargets : siblings).push(own ? st.target : u.unit_id);
    }
  }
  return {
    ...base, ...sel, answer: eq(v) ? 'match' : 'mismatch', table_value: v.show,
    table_form: v.via_label ? `label(${v.via_label})` : v.canon === null ? 'no_limit' : v.via_lot ? 'literal_selected_by_lot' : 'literal',
    notice_equals_sibling: [...new Set(siblings)].sort(cmpStr), notice_equals_other_target: [...new Set(otherTargets)].sort(cmpStr),
  };
}

// ------------------------------------------------------------------ statistics

/** Wilson score interval at 95 % (z = 1.96). null when n = 0. */
export function wilson(k, n, z = 1.96) {
  if (!n) return null;
  const p = k / n;
  const d = 1 + (z * z) / n;
  const c = (p + (z * z) / (2 * n)) / d;
  const h = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / d;
  const r = (x) => Math.round(x * 1e6) / 1e6;
  return { rate: r(p), lo: r(Math.max(0, c - h)), hi: r(Math.min(1, c + h)) };
}

const bump = (o, k, f) => { o[k] = o[k] || { match: 0, mismatch: 0, not_comparable: 0 }; o[k][f] += 1; };
const sortObj = (o) => Object.fromEntries(Object.keys(o).sort(cmpStr).map((k) => [k, o[k]]));

/** Aggregate compareItem results: counts, comparable rate (Wilson), mismatch clusters with adjudication_kind proposals. */
export function summarize(results, opts = {}) {
  const rs = [...results].sort((p, q) => cmpStr(String(p.variance_key), String(q.variance_key)));
  const by_answer = { match: 0, mismatch: 0, not_comparable: 0 };
  const by_reason = Object.fromEntries(REASONS.map((r) => [r, 0]));
  const by_target = {};
  const by_zone_class = {};
  const by_qualified = {};
  const by_exception_ref = {};
  const branch_in_set = { true: 0, false: 0 };
  const keyword_cross = { agree: 0, differ: 0, keyword_unmapped: 0 };
  const by_unavailable_input = Object.fromEntries(LOT_INPUTS_UNAVAILABLE.map((k) => [k, 0]));
  const link = { by_status: Object.fromEntries(LINK_STATUSES.map((k) => [k, 0])), proxy: Object.fromEntries(LINK_PROXY.map((k) => [k, 0])) };
  for (const r of rs) {
    by_answer[r.answer] += 1;
    if (r.answer === 'not_comparable') {
      const [head, input] = String(r.reason).split(':');
      by_reason[head] += 1;
      if (head === 'lot_input_unavailable') by_unavailable_input[input] += 1;
    }
    if (r.link_status) link.by_status[r.link_status] += 1;
    if (r.link_proxy) link.proxy[r.link_proxy] += 1;
    if (r.reason === 'branch_unresolved') branch_in_set[String(Boolean(r.in_branch_set))] += 1;
    bump(by_target, r.target || 'unmapped', r.answer);
    bump(by_zone_class, r.zone_class, r.answer);
    bump(by_qualified, String(r.qualified), r.answer);
    bump(by_exception_ref, String(r.has_exception_ref), r.answer);
    if (r.answer !== 'not_comparable') {
      if (!r.keyword_target) keyword_cross.keyword_unmapped += 1;
      else if (r.keyword_target === r.target) keyword_cross.agree += 1;
      else keyword_cross.differ += 1;
    }
  }
  const comparableN = by_answer.match + by_answer.mismatch;
  const strict = rs.filter((r) => r.answer !== 'not_comparable' && r.d8_row_level === 'comparable');
  const strictMatch = strict.filter((r) => r.answer === 'match').length;
  // mismatch clusters: (unit ids, table value, notice value)
  const cl = new Map();
  for (const r of rs) {
    if (r.answer !== 'mismatch') continue;
    const nv = `${fmtNum(r.notice_value)} ${r.notice_unit}`;
    const key = `${r.unit_ids.join(',')}\u0000${r.table_value}\u0000${nv}`;
    if (!cl.has(key)) cl.set(key, { regulation_id: r.regulation_id, unit_ids: r.unit_ids, target: r.target, table_value: r.table_value, table_form: r.table_form, notice_value: nv, rs: [] });
    cl.get(key).rs.push(r);
  }
  const clusters = [...cl.values()].map((c) => {
    const apps = new Set(c.rs.map((r) => r.application_number)).size;
    const other = c.rs.some((r) => r.notice_equals_other_target.length);
    const sib = c.rs.some((r) => r.notice_equals_sibling.length);
    const kwDiff = c.rs.some((r) => r.keyword_target && r.keyword_target !== r.target);
    const lotSel = c.rs.some((r) => r.table_form === 'literal_selected_by_lot');
    const kind = lotSel ? 'link' : other ? 'parse' : sib ? 'link' : apps >= 3 ? 'table' : 'parse';
    const basis = lotSel ? 'the branch was selected by a measured lot input (parcel dimension vs the examiner survey)' : other ? 'notice value equals another target of the same unit (keyword target picked the wrong statement)'
      : sib ? 'notice value equals a sibling unit of the same row (citation letter or branch drift)'
        : apps >= 3 ? `${apps} distinct applications state the same value (or law_change: 2017 text presumed unchanged, declared-only)`
          : kwDiff ? 'keyword target differs from the table target' : 'singleton or pair cluster';
    return {
      regulation_id: c.regulation_id, unit_ids: c.unit_ids, target: c.target, table_value: c.table_value, table_form: c.table_form,
      notice_value: c.notice_value, n: c.rs.length, applications: apps, adjudication_kind: kind, basis,
      zone_classes: [...new Set(c.rs.map((r) => r.zone_class))].sort(cmpStr), sibling_units: [...new Set(c.rs.flatMap((r) => r.notice_equals_sibling))].sort(cmpStr),
      samples: c.rs.slice(0, 5).map((r) => r.variance_key),
    };
  }).sort((p, q) => q.n - p.n || cmpStr(p.unit_ids.join(','), q.unit_ids.join(',')) || cmpStr(p.notice_value, q.notice_value));
  // R2-8 coverage and clusters: the items are clustered by row, so the honest zero-error bound is on rows
  const comp = rs.filter((r) => r.answer !== 'not_comparable');
  const byRow = new Map();
  for (const r of comp) {
    if (!byRow.has(r.regulation_id)) byRow.set(r.regulation_id, { regulation_id: r.regulation_id, n: 0, match: 0, mismatch: 0, label_matches: 0 });
    const c = byRow.get(r.regulation_id);
    c.n += 1; c[r.answer] += 1;
    if (r.answer === 'match' && String(r.table_form).startsWith('label')) c.label_matches += 1;
  }
  const clusters_by_row = [...byRow.values()].sort((p, q) => cmpStr(p.regulation_id, q.regulation_id)).map((c) => ({ ...c, wilson95: wilson(c.match, c.n) }));
  const unitSets = new Set(comp.map((r) => r.unit_ids.join(',')));
  const rowsReached = byRow.size;
  const coverage = {
    rows_reached: rowsReached, complete_rows: opts.complete_rows ?? null,
    rows_share: opts.complete_rows ? Math.round((rowsReached / opts.complete_rows) * 1e6) / 1e6 : null,
    unit_sets: unitSets.size, rows_with_mismatch: clusters_by_row.filter((c) => c.mismatch > 0).length,
    label_derived_matches: comp.filter((r) => r.answer === 'match' && String(r.table_form).startsWith('label')).length,
    lot_selected_matches: comp.filter((r) => r.answer === 'match' && r.table_form === 'literal_selected_by_lot').length,
    rule_of_three_rows_if_zero_table_errors: rowsReached ? Math.round((3 / rowsReached) * 1e6) / 1e6 : null,
    rule_of_three_unit_sets_if_zero_table_errors: unitSets.size ? Math.round((3 / unitSets.size) * 1e6) / 1e6 : null,
    top10_unit_set_share: comp.length ? Math.round(([...comp.reduce((m, r) => m.set(r.unit_ids.join(','), (m.get(r.unit_ids.join(',')) || 0) + 1), new Map()).values()].sort((a, b) => b - a).slice(0, 10).reduce((t, x) => t + x, 0) / comp.length) * 1e6) / 1e6 : null,
  };
  const d8_end_tag_items = rs.filter((r) => r.d8_end_tag).length;
  const by_kind = Object.fromEntries(ADJ_KINDS.map((k) => [k, clusters.filter((c) => c.adjudication_kind === k).reduce((s, c) => s + c.n, 0)]));
  // branch_unresolved items whose notice value is in NO branch: candidate table gaps (outside the headline)
  const gap = new Map();
  for (const r of rs) {
    if (r.reason !== 'branch_unresolved' || r.in_branch_set || !(r.table_values && r.table_values.length)) continue;
    const key = `${r.unit_ids.join(',')}\u0000${fmtNum(r.notice_value)} ${r.notice_unit}`;
    if (!gap.has(key)) gap.set(key, { unit_ids: r.unit_ids, table_values: r.table_values, notice_value: `${fmtNum(r.notice_value)} ${r.notice_unit}`, n: 0, samples: [] });
    const g = gap.get(key); g.n += 1; if (g.samples.length < 5) g.samples.push(r.variance_key);
  }
  return {
    n: rs.length, by_answer, by_reason, by_unavailable_input, coverage, clusters_by_row, link, d8_end_tag_items,
    comparable: { n: comparableN, match: by_answer.match, mismatch: by_answer.mismatch, wilson95: wilson(by_answer.match, comparableN) },
    by_target: sortObj(by_target), by_zone_class: sortObj(by_zone_class), by_qualified: sortObj(by_qualified), by_exception_ref: sortObj(by_exception_ref),
    d8_row_level_sensitivity: { n: strict.length, match: strictMatch, mismatch: strict.length - strictMatch, wilson95: wilson(strictMatch, strict.length) },
    branch_unresolved_in_set: branch_in_set, keyword_target_cross_check: keyword_cross, mismatch_by_proposed_kind: by_kind,
    clusters, branch_gaps: [...gap.values()].sort((p, q) => q.n - p.n || cmpStr(p.unit_ids.join(','), q.unit_ids.join(','))),
  };
}
