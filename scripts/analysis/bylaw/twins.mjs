// SPEC LINK: docs/specs/01-pipeline/68_mcbylaw_standard.md §7.4 (the canonical projection two drafts are compared on),
//            §9 ("a report-only arm never changes the exit code or a word verdict"), §10 (determinism);
//            docs/specs/01-pipeline/69a_mcbylaw_register.md M-117 (R-DET); process row "twins key alike (report-only)"
//            (operator-approved 2026-10-14; register row proposed, not yet written); Spec 124a R-H (report, never fail).
//
// TWINS KEY ALIKE (report-only). Identical clause text in different regulations (the same rule restated per zone: R,
// RD, RS, RT, RM …) must be keyed alike. This module groups agreed units whose clause text is identical after
// normalisation, at the same leaf path, and classifies each group:
//
//   same            every member's projection is equal on every compared field
//   value_differs   a member differs on a ⧉ field (DOUBLE_KEYED: archetype · target · bound · numeric_expression) or on
//                   `condition` — the evaluated result can differ
//   label_only      the ⧉ fields and condition agree; members differ only on application (building types, lot
//                   conditions, uses — never zones), applies_to.part, literals_not_expressed or calculation status
//
// It never fails anything: the --check line is informational (Spec 68 §9 report-only arm). Replaces the heuristic
// one-off scan (scratchpad lts/sweep/twins.cjs, LANE P1-SWEEP 2026-10-14); its normalisation rules are kept verbatim.
//
//   normaliseClause(text)                 → the comparison form of a clause text. PURE.
//   leafOf(unitId)                        → the unit's path with its regulation-local leading `(n)` dropped. PURE.
//   projectUnit(unit)                     → {field: canonical string} over COMPARED_FIELDS, zone/clause-number free. PURE.
//   twinsReport(entries)                  → {groups, differ, value, label_only, units_in_differ, by_field, list}. PURE.
//                                           entries = [{unit, text}] (unit.unit_id = `<reg>#<path>`).
//   twinsFromUnits({units, slice})        → twinsReport over agreed units (Map or array), texts from the slice. PURE.
//   twinsLine(report)                     → the one --check line. PURE.
//   selfTest()                            → known-bad / good-twin fixtures. PURE.
import { DOUBLE_KEYED, buildIndex, canonicalField, getField, splitUnitId, unitView } from './authored.mjs';
import { chapterZone } from './evaluate.mjs';

/** The 569-2013 zone symbols the sweep normalised (a symbol directly followed by " zone"). */
export const ZONE_CODES = Object.freeze(['R', 'RD', 'RS', 'RT', 'RM', 'RA', 'RAC', 'CR', 'CRE', 'CL', 'CO', 'CH', 'E', 'EL', 'EH', 'EO', 'I', 'IE', 'IH', 'IG', 'IS', 'IC', 'ON', 'OR', 'OG', 'OC', 'OM', 'UT', 'RL', 'RN']);
/** A normalised text shorter than this is a heading or a fragment ("(A) 7.5 metres;"), not a restated rule. */
export const MIN_TEXT_LEN = 60;
export const VALUE_FIELDS = Object.freeze([...DOUBLE_KEYED, 'condition']);
export const LABEL_FIELDS = Object.freeze(['application', 'applies_to', 'literals_not_expressed', 'calculation_handling.status']);
export const COMPARED_FIELDS = Object.freeze([...VALUE_FIELDS, ...LABEL_FIELDS]);
export const KINDS = Object.freeze(['same', 'label_only', 'value_differs']);

const cmpStr = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const ZONE_RE = new RegExp(`\\b(${ZONE_CODES.join('|')})\\b(?= zone)`, 'g');

/** The sweep's rules, in order: By-law tags · zone symbols · "regulation(s)" · regulation numbers · the leading `(n)` ·
 * remaining `(n)` · reference lists · whitespace · case. PURE. */
export function normaliseClause(text) {
  return String(text ?? '')
    .replace(/\[\s*By-law:[^\]]*\]/gi, '')
    .replace(ZONE_RE, 'Z')
    .replace(/\bregulations?\s+/gi, '')
    .replace(/\b\d{2,3}\.\d{1,3}(\.\d{1,3}){0,2}(\(\d+\))*(\([A-Za-z]+\))*/g, 'REG')
    .replace(/^\(\d+\)/, '')
    .replace(/\(\d+\)/g, '(n)')
    .replace(/\b(REG|\(n\))( (to|and|or) (REG|\(n\)))+/g, 'REF')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/** Drop the regulation-local leading `(n)` of a clause path: `(3)(A)` and `(5)(A)` are the same leaf of twin rules. */
const dropLead = (p) => String(p ?? '').replace(/\s+/g, '').replace(/^\(\d+\)/, '');
export const leafOf = (unitId) => dropLead(splitUnitId(unitId).path).replace(/~under_appeal/g, '');

/** canonicalField, total: an unparseable value projects to its raw text (agreed units parse; fixtures may not). */
function canon(p, v, ctx) {
  try {
    return canonicalField(p, v, ctx);
  } catch {
    return `?${JSON.stringify(v ?? null)}`;
  }
}

/** One unit's comparison form: the G-AGREE canonical projection (Spec 68 §7.4) with the twin-specific parts removed —
 * expression anchors are dropped, literal clauses lose their leading `(n)`; application zones become self / ¬self. PURE. */
export function projectUnit(unit) {
  const out = {};
  for (const f of VALUE_FIELDS) out[f] = canon(f, getField(unit, f));
  // a statement's final `@clause_path` is provenance (which words state it), not value: `@(2)` ≡ `@(2)(A)` (sweep rule)
  out.numeric_expression = [...new Set(out.numeric_expression.split('\n').map((s) => s.replace(/@[^@]*$/, '')))].sort(cmpStr).join('\n');
  const app = unit.application;
  let a = canon('application', app, { unitId: unit.unit_id });
  const z = chapterZone(splitUnitId(unit.unit_id).reg);
  if (z) a = a.replace(`z[¬${z}]`, 'z[¬self]').replace(`z[${z}]`, 'z[self]');
  else if (app && typeof app === 'object') a = a.replace(/^z\[[^\]]*\]/, 'z[*]'); // a non-chapter rule names its own zones
  out.application = a;
  const at = unit.applies_to;
  out.applies_to = at && typeof at === 'object' ? String(at.part) : canon('applies_to', at);
  const lne = unit.literals_not_expressed;
  out.literals_not_expressed = canon('literals_not_expressed', Array.isArray(lne) ? lne.map((x) => (x && typeof x === 'object' ? { ...x, clause: dropLead(x.clause) } : x)) : lne);
  out['calculation_handling.status'] = canon('calculation_handling.status', getField(unit, 'calculation_handling.status'));
  return out;
}

/** Group and classify. PURE; deterministic (byte-identical output for any input order). */
export function twinsReport(entries) {
  const byKey = new Map();
  for (const { unit, text } of entries || []) {
    if (!unit || !unit.unit_id) continue;
    const reg = splitUnitId(unit.unit_id).reg;
    if (/^900\./.test(reg)) continue; // Ch.900 exceptions are site-specific by design, never twins
    const n = normaliseClause(text);
    if (n.length < MIN_TEXT_LEN) continue;
    const k = `${n}␟${leafOf(unit.unit_id)}`;
    if (!byKey.has(k)) byKey.set(k, []);
    byKey.get(k).push({ unit, reg });
  }
  const list = [];
  const byField = Object.fromEntries(COMPARED_FIELDS.map((f) => [f, 0]));
  for (const [, ms] of byKey) {
    if (ms.length < 2 || new Set(ms.map((m) => m.reg)).size < 2) continue; // twins live in different regulations
    const proj = ms.map((m) => projectUnit(m.unit));
    const fields = COMPARED_FIELDS.filter((f) => new Set(proj.map((p) => p[f])).size > 1);
    for (const f of fields) byField[f]++;
    const kind = fields.some((f) => VALUE_FIELDS.includes(f)) ? 'value_differs' : fields.length ? 'label_only' : 'same';
    list.push({ kind, fields, units: ms.map((m) => m.unit.unit_id).sort(cmpStr) });
  }
  list.sort((a, b) => cmpStr(a.units[0], b.units[0]));
  const of = (k) => list.filter((g) => g.kind === k);
  const differ = list.filter((g) => g.kind !== 'same');
  return {
    groups: list.length,
    differ: differ.length,
    value: of('value_differs').length,
    label_only: of('label_only').length,
    units_in_differ: differ.reduce((s, g) => s + g.units.length, 0),
    by_field: byField,
    list,
  };
}

/** Agreed units (Map unit_id → unit, or an array) → twinsReport; clause text from the slice (unitView). PURE. */
export function twinsFromUnits({ units, slice }) {
  const index = buildIndex(slice);
  const arr = units instanceof Map ? [...units].map(([id, u]) => ({ ...u, unit_id: u.unit_id || id })) : [...(units || [])];
  return twinsReport(arr.map((unit) => {
    const v = unitView(index, unit.unit_id);
    return { unit, text: v ? v.text : '' };
  }));
}

/** The informational --check line (indented: never `WORD:`-shaped, Spec 68 §4). PURE. */
export function twinsLine(r) {
  return `  report-only twins: groups ${r.groups} · differ ${r.differ} (value ${r.value} · label ${r.label_only}; ${r.units_in_differ} units) — never a blocker`;
}

// ---------------------------------------------------------------- self-test

/** Fixtures: each classification both ways, and each normalisation rule. PURE. */
export function selfTest() {
  const T = 'The permitted maximum height for a building or structure on a lot in the R zone is the numerical value following HT.';
  const base = (reg, path, over = {}) => ({
    unit_id: `${reg}#${path}`, archetype: 'LIMIT', target: 'height_m', bound: 'max', numeric_expression: [`height_m = overlay(HT) @${path}`],
    condition: 'none', applies_to: { part: 'whole', refs: [] }, literals_not_expressed: [], calculation_handling: { status: 'modelled' },
    application: { zones: [chapterZone(reg) || 'R'], building_types: ['any'], lot_conditions: [], uses: [], evidence: {} }, ...over,
  });
  const pair = (a, b, ta = T, tb = T.replace('R zone', 'RD zone')) => twinsReport([{ unit: a, text: ta }, { unit: b, text: tb }]);
  const results = [];
  const t = (name, ok) => results.push({ name, pass: !!ok });
  const a = base('10.10.40.10(1)', '(1)(A)');
  t('same: zone + leading (n) + anchor normalised', (() => { const r = pair(a, base('10.20.40.10(2)', '(2)(A)')); return r.groups === 1 && r.list[0].kind === 'same'; })());
  t('value_differs: bound', pair(a, base('10.20.40.10(1)', '(1)(A)', { bound: 'min' })).list[0]?.kind === 'value_differs');
  t('value_differs: condition', pair(a, base('10.20.40.10(1)', '(1)(A)', { condition: { tokens: ['overlay_mapped'], if: 'mapped(HT)' } })).list[0]?.kind === 'value_differs');
  t('label_only: building types', pair(a, base('10.20.40.10(1)', '(1)(A)', { application: { zones: ['RD'], building_types: ['detached_house'], lot_conditions: [], uses: [], evidence: {} } })).list[0]?.kind === 'label_only');
  t('label_only: zones alone never differ', pair(a, base('10.20.40.10(1)', '(1)(A)', { application: { zones: ['RD'], building_types: ['any'], lot_conditions: [], uses: [], evidence: { RD: 'x' } } })).list[0]?.kind === 'same');
  t('not a twin: same regulation', pair(a, base('10.10.40.10(1)', '(1)(B)'), T, T).groups === 0);
  t('not a twin: different leaf', pair(a, base('10.20.40.10(1)', '(1)(B)')).groups === 0);
  t('not a twin: Ch.900', pair(base('900.2.10(5)', '(5)(A)'), base('900.3.10(5)', '(5)(A)')).groups === 0);
  t('not a twin: short text', pair(a, base('10.20.40.10(1)', '(1)(A)'), '(A) 7.5 metres;', '(A) 7.5 metres;').groups === 0);
  t('not a twin: different words', pair(a, base('10.20.40.10(1)', '(1)(A)'), T, T.replace('maximum', 'minimum')).groups === 0);
  t('norm: By-law tag + regulation number + case', normaliseClause('Regulation 10.20.40.10(1)(A) applies IN the RD zone [ By-law: 89-2022 ]') === normaliseClause('regulation 10.10.40.10(3) applies in the R zone'));
  t('norm: a zone symbol not followed by "zone" is kept', normaliseClause('RD lots') !== normaliseClause('R lots'));
  return { pass: results.every((r) => r.pass), results };
}
