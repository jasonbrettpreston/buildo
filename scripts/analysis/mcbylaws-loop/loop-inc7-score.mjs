// SPEC LINK: docs/specs/01-pipeline/69a_mcbylaw_register.md M-362 (498)
// SPEC LINK: docs/specs/01-pipeline/68_mcbylaw_standard.md SC-19 (84)
// Every open choice is a SETTING read from mcbylaws/loop/inc7-scorer-settings.json (direction measures and gate measures, the
// threshold percent and its count rounding, the denominator, the variance values, the tolerance per measure; the closeness
// measure, population, spread and threshold; the catch verdicts, class table, limit-match window, false-alarm categories and
// thresholds): no exception paths, and no clause, class name, verdict, measure name or threshold is hard-coded here.
// The six class names come only from the settings class table (catch.class_rules); a row no rule claims takes
// catch.unclassified_class. The only disk access is the injected readJson / reader.layer3Rows of runInc7: this module holds no fs,
// no env, no exits and no other IO. Inputs and settings are never mutated: every function returns fresh data.
import { createHash } from 'node:crypto';

const SETTINGS_INVALID = 'inc7_settings_invalid';
const INPUT_INVALID = 'inc7_input_invalid';
const ROUNDINGS = new Set(['ceil', 'floor', 'round']);
const SPREADS = new Set(['iqr', 'min_max', 'stdev']);
const DENOMINATORS = new Set(['all_cases', 'evaluated_cases']);
const THRESHOLD_KINDS = new Set(['pct_min', 'count_max']);
// The four verdict roles a catch derivation needs; the words themselves are settings.
const VERDICT_ROLES = ['exceeds', 'may_exceed', 'complies', 'not_evaluated'];
const RATIO_DP = 3;
const SAFE_FACTOR = 1e9;
const DIGEST_CHARS = 12;

const isObj = (x) => x !== null && typeof x === 'object' && !Array.isArray(x);
const isNum = (x) => typeof x === 'number' && Number.isFinite(x);
const isStr = (x) => typeof x === 'string';
const arr = (x) => (Array.isArray(x) ? x : []);
const isNothing = (x) => x === null || x === undefined;
const roundDp = (x, dp) => {
  const f = 10 ** dp;
  return Math.round(x * f) / f;
};
// Floating-safe rounding for counts: a product within a hair of a whole number is that whole number (22.5 stays 22.5).
const snap = (x) => Math.round(x * SAFE_FACTOR) / SAFE_FACTOR;
const invalidates = (detail) => new Error(`${SETTINGS_INVALID}:${detail}`);
const rejects = (detail) => new Error(`${INPUT_INVALID}:${detail}`);

/** The number of correct cases a percent threshold requires, rounded up / down / nearest (snapped: 18.000000000000004 beats 18). PURE. */
export function requiredCorrect(n, pct, rounding) {
  if (!ROUNDINGS.has(rounding)) throw invalidates(`rounding_unknown:${String(rounding)}`);
  const count = Number.isFinite(n) && n > 0 ? n : 0;
  const share = snap((count * pct) / 100);
  if (rounding === 'ceil') return Math.ceil(share);
  if (rounding === 'floor') return Math.floor(share);
  return Math.round(share);
}

/** Every violation of the settings contract as a code, `code:detail` when it names a value; empty = green. PURE. */
export function validateSettings(s) {
  const out = [];
  if (!isObj(s)) return ['settings_invalid'];
  const l3 = isObj(s.layer3) ? s.layer3 : null;
  if (!l3) out.push('layer3_missing');
  else {
    if (!Array.isArray(l3.usable_status)) out.push('usable_status_missing');
    const fields = isObj(l3.field_by_measure) ? l3.field_by_measure : null;
    if (!fields) out.push('field_by_measure_missing');
    else {
      const named = new Set([...Object.keys(fields), ...arr(s.direction && s.direction.measures)]);
      for (const m of named) {
        if (!isStr(fields[m]) || fields[m] === '') out.push(`field_missing:${m}`);
      }
    }
  }

  const d = isObj(s.direction) ? s.direction : null;
  if (!d) out.push('direction_missing');
  else {
    if (!Array.isArray(d.measures) || d.measures.length === 0) out.push('measures_missing');
    if (!Array.isArray(d.gate_measures)) out.push('gate_measures_missing');
    else {
      for (const m of d.gate_measures) {
        if (!isStr(m) || !arr(d.measures).includes(m)) out.push(`gate_measure_unknown:${String(m)}`);
      }
    }
    if (!isNum(d.threshold_pct) || d.threshold_pct <= 0 || d.threshold_pct > 100) out.push('threshold_pct_invalid');
    if (!ROUNDINGS.has(d.count_rounding)) out.push(`rounding_unknown:${String(d.count_rounding)}`);
    if (!DENOMINATORS.has(d.denominator)) out.push(`denominator_unknown:${String(d.denominator)}`);
    if (!Array.isArray(d.variance_granted_values)) out.push('variance_granted_values_missing');
    if (!isObj(d.tolerance)) out.push('tolerance_missing');
    else {
      for (const m of arr(d.measures)) {
        if (!isNum(d.tolerance[m])) out.push(`tolerance_missing:${m}`);
      }
    }
  }

  const c = isObj(s.closeness) ? s.closeness : null;
  if (!c) out.push('closeness_missing');
  else {
    // A closeness measure with no usable field is named once, by the same code the direction measures use.
    if (!isStr(c.measure) || c.measure === '') out.push('closeness_measure_missing');
    else if (!l3 || !isObj(l3.field_by_measure)) out.push(`field_missing:${c.measure}`);
    else if (!isStr(l3.field_by_measure[c.measure]) || l3.field_by_measure[c.measure] === '') {
      out.push(`field_missing:${c.measure}`);
    }
    if (!isObj(c.population)) out.push('closeness_population_missing');
    if (!SPREADS.has(c.spread)) out.push(`spread_unknown:${String(c.spread)}`);
    if (!isNothing(c.threshold) && !isNum(c.threshold)) out.push('closeness_threshold_invalid');
  }

  const k = isObj(s.catch) ? s.catch : null;
  if (!k) out.push('catch_missing');
  else {
    if (!Array.isArray(k.verdicts) || k.verdicts.length === 0) out.push('verdicts_missing');
    // Every role names a verdict word the settings actually hold: a role outside catch.verdicts names nothing.
    const roles = isObj(k.verdict_roles) ? k.verdict_roles : null;
    if (!roles) out.push('verdict_roles_missing');
    for (const role of VERDICT_ROLES) {
      const word = roles === null ? undefined : roles[role];
      if (!isStr(word) || word === '' || !arr(k.verdicts).includes(word)) out.push(`verdict_role_missing:${role}`);
    }
    if (!Array.isArray(k.denominator_classes)) out.push('denominator_classes_missing');
    if (!isStr(k.unclassified_class) || k.unclassified_class === '') out.push('unclassified_class_missing');
    if (!Array.isArray(k.false_alarm_categories) || k.false_alarm_categories.length === 0) out.push('false_alarm_categories_missing');
    // The fallback for an unnamed category must be one of the categories the thresholds can name.
    if (!isStr(k.false_alarm_fallback_category) || !arr(k.false_alarm_categories).includes(k.false_alarm_fallback_category)) {
      out.push('fallback_category_invalid');
    }
    if (!isObj(k.limit_match) || !isNum(k.limit_match.abs) || !isNum(k.limit_match.rel_pct)) out.push('limit_match_invalid');

    const rules = Array.isArray(k.class_rules) ? k.class_rules : null;
    if (!rules) out.push('class_rules_missing');
    else {
      for (const r of rules) {
        if (!isObj(r) || !isStr(r.class) || r.class === '') out.push('class_rule_class_empty');
      }
      const named = new Set(rules.filter((r) => isObj(r) && isStr(r.class) && r.class !== '').map((r) => r.class));
      for (const cls of arr(k.denominator_classes)) {
        if (!named.has(cls)) out.push(`class_rule_class_unknown:${String(cls)}`);
      }
    }
    const classes = new Set(rules ? rules.filter((r) => isObj(r) && isStr(r.class)).map((r) => r.class) : []);

    if (!Array.isArray(k.thresholds)) out.push('thresholds_missing');
    else {
      for (const t of k.thresholds) {
        if (!isObj(t)) {
          out.push('threshold_invalid');
          continue;
        }
        const id = isStr(t.id) && t.id !== '' ? t.id : 'unknown';
        if (!THRESHOLD_KINDS.has(t.kind)) out.push(`threshold_kind_unknown:${id}`);
        if (!isNum(t.value)) out.push(`threshold_value_invalid:${id}`);
        if (!Array.isArray(t.classes) || t.classes.length === 0) out.push(`threshold_classes_missing:${id}`);
        else {
          for (const cls of t.classes) {
            if (!classes.has(cls)) out.push(`threshold_class_unknown:${cls}`);
          }
        }
        if (!isNothing(t.category) && (!isStr(t.category) || !arr(k.false_alarm_categories).includes(t.category))) {
          out.push(`threshold_category_unknown:${id}`);
        }
      }
    }
  }
  return out;
}

/** The usable maximum of a parcel for a case's building type on a measure, with the reason it is not usable. PURE. */
export function maxFor(layer3Rows, parcelId, buildingType, measure, settings) {
  if (!isStr(buildingType) || buildingType === '') return { value: null, reason: 'no_class' };
  const fields = isObj(settings?.layer3?.field_by_measure) ? settings.layer3.field_by_measure : {};
  const fieldId = fields[measure];
  const usable = new Set(arr(settings?.layer3?.usable_status));
  const rows = arr(layer3Rows).filter(
    (r) => isObj(r) && r.parcel_id === parcelId && r.field_id === fieldId && r.building_type === buildingType,
  );
  if (rows.length === 0) return { value: null, reason: 'no_row' };
  let reason = null;
  let found = null;
  // Two usable rows that disagree are not resolved by input order: no maximum. A row repeating the same figure is fine.
  for (const r of rows) {
    if (!usable.has(r.status)) {
      if (reason === null || reason === 'ok') reason = `status:${String(r.status)}`;
      continue;
    }
    const v = typeof r.value === 'string' ? toNum(r.value) : r.value;
    if (!isNum(v)) {
      if (reason === null || reason === 'ok') reason = `status:${String(r.status)}`;
      continue;
    }
    if (found === null) found = v;
    else if (found !== v) return { value: null, reason: 'ambiguous' };
  }
  if (found !== null) return { value: found, reason: 'ok' };
  return { value: null, reason: reason === null ? 'no_row' : reason };
}

// A finite number or a numeric string is a figure; anything else is not.
function toNum(x) {
  if (isNum(x)) return x;
  if (typeof x === 'string' && x.trim() !== '') {
    const n = Number(x);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function figureOf(applicant, measure) {
  if (!isObj(applicant)) return null;
  return toNum(applicant[measure]);
}

/** One case's direction verdict: no figure, not evaluated, correct or wrong (a variance on the measure flips the comparison). PURE. */
export function directionCase(args) {
  const a = isObj(args) ? args : {};
  const applicant = toNum(a.applicant);
  if (applicant === null) return { status: 'no_applicant_figure' };
  const max = toNum(a.max);
  if (max === null) return { status: 'not_evaluated' };
  const tol = isNum(a.tol) ? a.tol : 0;
  const within = applicant <= max + tol;
  if (a.variance) return { status: within ? 'wrong' : 'correct' };
  return { status: within ? 'correct' : 'wrong' };
}

// (caseId, measure) -> the rows of that pair, in input order.
function varianceIndex(varianceRows) {
  const map = new Map();
  for (const r of arr(varianceRows)) {
    if (!isObj(r)) continue;
    const key = `${String(r.case)}\u0000${String(r.measure)}`;
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(r);
  }
  return map;
}
const rowsFor = (index, caseId, measure) => index.get(`${String(caseId)}\u0000${String(measure)}`) ?? [];

function hasVariance(index, caseId, measure, grantedValues) {
  const granted = new Set(arr(grantedValues));
  return rowsFor(index, caseId, measure).some((r) => granted.has(r.granted));
}

/** The direction test per measure: counts, operator-chosen denominator, required count and the gate. PURE. */
export function scoreDirection(cases, layer3Rows, varianceRows, settings) {
  const d = isObj(settings?.direction) ? settings.direction : {};
  const index = varianceIndex(varianceRows);
  const gate = new Set(arr(d.gate_measures));
  const denomMode = d.denominator;
  const out = {};
  for (const measure of arr(d.measures)) {
    const tol = isNum(d.tolerance?.[measure]) ? d.tolerance[measure] : 0;
    const wrongCases = [];
    const notEvaluatedCases = [];
    let evaluated = 0;
    let correct = 0;
    let notEvaluated = 0;
    let noFigure = 0;
    for (const c of arr(cases)) {
      if (!isObj(c)) continue;
      const applicant = figureOf(c.applicant, measure);
      if (applicant === null) {
        noFigure += 1;
        continue;
      }
      const variance = hasVariance(index, c.case, measure, d.variance_granted_values);
      const vt = varianceCaseStatus(c, layer3Rows, measure, settings, applicant, variance, tol);
      if (vt.status === 'no_applicant_figure') noFigure += 1;
      else if (vt.status === 'not_evaluated') {
        notEvaluated += 1;
        notEvaluatedCases.push(String(c.case));
      } else {
        evaluated += 1;
        if (vt.status === 'correct') correct += 1;
        else wrongCases.push(String(c.case));
      }
    }
    const denominator = denomMode === 'evaluated_cases' ? evaluated : evaluated + notEvaluated;
    const required = requiredCorrect(denominator, d.threshold_pct, d.count_rounding);
    // An empty denominator requires nothing, so correct >= required is vacuously true: it never passes.
    out[measure] = {
      gated: gate.has(measure),
      cases: arr(cases).filter(isObj).length,
      evaluated,
      correct,
      wrong: wrongCases.length,
      not_evaluated: notEvaluated,
      no_applicant_figure: noFigure,
      denominator,
      required,
      pass: denominator > 0 && correct >= required,
      wrong_cases: wrongCases,
      not_evaluated_cases: notEvaluatedCases,
    };
  }
  return out;
}

function varianceCaseStatus(c, layer3Rows, measure, settings, applicant, variance, tol) {
  const m = maxFor(layer3Rows, c.parcel_id, c.applicant_class, measure, settings);
  return directionCase({ applicant, max: m.value, variance, tol });
}

function ratioValues(cases, layer3Rows, varianceRows, settings) {
  const cl = isObj(settings?.closeness) ? settings.closeness : {};
  const measure = cl.measure;
  const population = isObj(cl.population) ? cl.population : {};
  const index = varianceIndex(varianceRows);
  // The population is a FILTER TABLE: a boolean key must EQUAL the case's fact (a false key excludes the true cases);
  // a null or absent key filters nothing.
  const values = [];
  for (const c of arr(cases)) {
    if (!isObj(c)) continue;
    const isNewBuild = c.new_build === true;
    if (typeof population.new_build === 'boolean' && isNewBuild !== population.new_build) continue;
    const hasVar = hasVariance(index, c.case, measure, settings?.direction?.variance_granted_values);
    if (typeof population.variance_on_measure === 'boolean' && hasVar !== population.variance_on_measure) continue;
    const applicant = figureOf(c.applicant, measure);
    if (applicant === null) continue;
    const m = maxFor(layer3Rows, c.parcel_id, c.applicant_class, measure, settings);
    // A zero or negative maximum is not a quantity to be close to: the ratio over it is no measurement at all.
    if (m.value === null || m.value <= 0) continue;
    values.push({ case: String(c.case), ratio: roundDp(applicant / m.value, RATIO_DP) });
  }
  return values;
}

// R type 7 quantile interpolation on ascending values.
function quantile(sorted, p) {
  if (sorted.length === 0) return null;
  if (sorted.length === 1) return sorted[0];
  const pos = (sorted.length - 1) * p;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

function medianOf(sorted) {
  const q = quantile(sorted, 0.5);
  return q === null ? null : roundDp(q, RATIO_DP);
}

function spreadOf(kind, sorted) {
  if (sorted.length === 0) return null;
  if (kind === 'iqr') {
    const q1 = roundDp(quantile(sorted, 0.25), RATIO_DP);
    const q3 = roundDp(quantile(sorted, 0.75), RATIO_DP);
    return { kind, q1, q3, iqr: roundDp(q3 - q1, RATIO_DP) };
  }
  if (kind === 'min_max') {
    return { kind, min: roundDp(sorted[0], RATIO_DP), max: roundDp(sorted[sorted.length - 1], RATIO_DP) };
  }
  const mean = sorted.reduce((a, b) => a + b, 0) / sorted.length;
  const variance = sorted.reduce((a, b) => a + (b - mean) ** 2, 0) / sorted.length;
  return { kind, stdev: roundDp(Math.sqrt(variance), RATIO_DP) };
}

/** The closeness of applicant to our maximum on the settings' measure: median and spread; the threshold as the settings hold it (often null). PURE. */
export function scoreCloseness(cases, layer3Rows, varianceRows, settings) {
  const cl = isObj(settings?.closeness) ? settings.closeness : {};
  const values = ratioValues(cases, layer3Rows, varianceRows, settings);
  const sorted = values.map((v) => v.ratio).sort((a, b) => a - b);
  const median = medianOf(sorted);
  const threshold = isNum(cl.threshold) ? cl.threshold : null;
  return {
    measure: cl.measure,
    n: values.length,
    median,
    spread: spreadOf(cl.spread, sorted),
    values,
    threshold,
    threshold_met: threshold === null || median === null ? null : median >= threshold,
  };
}

/** The class of one catch row from the settings class table (first rule that claims it), else the unclassified class. PURE. */
export function classifyRow(facts, settings) {
  const k = isObj(settings?.catch) ? settings.catch : {};
  const f = isObj(facts) ? facts : {};
  const verdict = isStr(f.our_verdict) ? f.our_verdict : null;
  const match = typeof f.limit_match === 'boolean' ? f.limit_match : null;
  for (const r of arr(k.class_rules)) {
    if (!isObj(r)) continue;
    if (r.city_row !== f.city_row) continue;
    if (!arr(r.our_verdict).includes(verdict)) continue;
    if (r.limit_match === true && match !== true) continue;
    if (r.limit_match === false && match !== false) continue;
    return r.class;
  }
  return k.unclassified_class;
}

/** Whether the City's limit and ours agree inside the settings window (abs OR rel), or null when either is not a number. PURE. */
export function limitMatch(cityLimit, ourLimit, settings) {
  const lm = isObj(settings?.catch?.limit_match) ? settings.catch.limit_match : null;
  if (lm === null) return null;
  if (!isNum(cityLimit) || !isNum(ourLimit)) return null;
  const diff = Math.abs(cityLimit - ourLimit);
  if (diff <= lm.abs) return true;
  const rel = (Math.abs(cityLimit) * lm.rel_pct) / 100;
  if (diff <= rel) return true;
  return false;
}

function verdictOf(vrow, derived) {
  if (isStr(vrow?.our_verdict) && vrow.our_verdict !== '') return vrow.our_verdict;
  return derived;
}

function derivedVerdict(applicant, max, tol, roles) {
  // The roles are settings, by NAME: the order of catch.verdicts names nothing.
  const r = isObj(roles) ? roles : {};
  if (max === null) return r.not_evaluated;
  if (applicant === null) return r.may_exceed;
  return applicant > max + tol ? r.exceeds : r.complies;
}

/** The catch table and its thresholds (SC-19): every variance row classified against the settings, the denominator, the rates. PURE. */
export function scoreCatch(cases, layer3Rows, varianceRows, settings) {
  const k = isObj(settings?.catch) ? settings.catch : {};
  const d = isObj(settings?.direction) ? settings.direction : {};
  const verdicts = isObj(k.verdict_roles) ? k.verdict_roles : {};
  const byCase = new Map();
  for (const c of arr(cases)) {
    if (isObj(c)) byCase.set(String(c.case), c);
  }
  const denominatorClasses = new Set(arr(k.denominator_classes));
  const measured = new Set(arr(k.false_alarm_categories));
  // The fallback for a category the settings do not name is a SETTING, not a guess from the list's order.
  const otherCategory = isStr(k.false_alarm_fallback_category) ? k.false_alarm_fallback_category : null;

  const rows = [];
  for (const vr of arr(varianceRows)) {
    if (!isObj(vr)) continue;
    const caseId = String(vr.case);
    const measure = String(vr.measure);
    const c = byCase.get(caseId);
    const parcelId = isObj(c) ? c.parcel_id : null;
    const buildingType = isObj(c) ? c.applicant_class : null;
    const m = isObj(c) ? maxFor(layer3Rows, parcelId, buildingType, measure, settings) : { value: null, reason: 'no_row' };
    const derivedLimit = vr.our_limit === undefined ? m.value : toNum(vr.our_limit);
    const applicant = isObj(c) ? figureOf(c.applicant, measure) : null;
    const tol = isNum(d.tolerance?.[measure]) ? d.tolerance[measure] : 0;
    const ourVerdict = verdictOf(vr, derivedVerdict(applicant, m.value, tol, verdicts));
    const cityLimit = toNum(vr.city_limit);
    const limitMatchValue = limitMatch(cityLimit, derivedLimit, settings);
    const cityRow = vr.city_row === true;
    const cls = classifyRow({ city_row: cityRow, our_verdict: ourVerdict, limit_match: limitMatchValue }, settings);
    let category = null;
    if (cls !== k.unclassified_class) {
      const given = isStr(vr.category) ? vr.category : '';
      category = measured.has(given) ? given : otherCategory;
    }
    rows.push({
      case: caseId,
      measure,
      city_row: cityRow,
      our_verdict: ourVerdict,
      city_limit: cityLimit,
      our_limit: isNum(derivedLimit) ? derivedLimit : null,
      limit_match: limitMatchValue,
      category,
      class: cls,
    });
  }

  const counts = {};
  for (const r of rows) counts[r.class] = (counts[r.class] ?? 0) + 1;
  const denominator = rows.filter((r) => denominatorClasses.has(r.class)).length;

  const rates = {};
  for (const t of arr(k.thresholds)) {
    if (!isObj(t) || !isStr(t.id)) continue;
    const classes = arr(t.classes);
    const hit = rows.filter((r) => classes.includes(r.class) && (t.category === undefined || t.category === null || r.category === t.category));
    const numerator = hit.length;
    if (t.kind === 'pct_min') {
      // The comparison is against the EXACT percentage: 1749 of 2500 is 69.96 and must fail a 70 minimum,
      // which a 1-dp rounded actual (70.0) would wrongly pass. display carries the rounded value for reports.
      const pct = denominator === 0 ? null : (numerator * 100) / denominator;
      rates[t.id] = {
        id: t.id,
        kind: t.kind,
        value: t.value,
        actual: pct,
        display: pct === null ? null : roundDp(pct, 1),
        numerator,
        denominator,
        pass: pct !== null && isNum(t.value) && pct >= t.value,
      };
    } else {
      rates[t.id] = {
        id: t.id,
        kind: t.kind,
        value: t.value,
        actual: numerator,
        numerator,
        denominator,
        pass: isNum(t.value) && numerator <= t.value,
      };
    }
  }
  const thresholds = arr(k.thresholds)
    .filter((t) => isObj(t) && isStr(t.id) && rates[t.id] !== undefined)
    .map((t) => rates[t.id]);
  return {
    rows,
    counts,
    denominator,
    rates,
    thresholds,
    pass: thresholds.length > 0 && thresholds.every((t) => t.pass),
  };
}

// Canonical JSON: keys sorted at every level, so the digest names the settings and nothing else.
function canonical(v) {
  if (v === null || typeof v !== 'object') return JSON.stringify(v) ?? 'null';
  if (Array.isArray(v)) return `[${v.map(canonical).join(',')}]`;
  return `{${Object.keys(v)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${canonical(v[k])}`)
    .join(',')}}`;
}

/** The settings digest: the first 12 hex characters of sha256 over the canonical settings. PURE. */
export function settingsDigest(settings) {
  return createHash('sha256').update(canonical(settings), 'utf8').digest('hex').slice(0, DIGEST_CHARS);
}

function checkCases(cases) {
  if (!Array.isArray(cases)) throw rejects('cases');
  const seen = new Set();
  for (const c of cases) {
    if (!isObj(c)) throw rejects('cases');
    const id = String(c.case);
    if (seen.has(id)) throw rejects(`cases_duplicate:${id}`);
    seen.add(id);
  }
}

function checkRowList(list, what) {
  if (!Array.isArray(list)) throw rejects(what);
  for (const r of list) {
    if (!isObj(r)) throw rejects(what);
  }
}

/** The whole increment-7 result: direction, closeness, catch, ok and the settings digest; refuses bad settings or inputs. PURE. */
export function scoreInc7(input) {
  const inp = isObj(input) ? input : {};
  const settings = inp.settings;
  const violations = validateSettings(settings);
  if (violations.length > 0) throw invalidates(violations.join(';'));
  checkCases(inp.cases);
  checkRowList(inp.layer3Rows, 'layer3_rows');
  checkRowList(inp.varianceRows, 'variance_rows');
  const cases = inp.cases;
  const layer3Rows = inp.layer3Rows;
  const varianceRows = inp.varianceRows;
  const direction = scoreDirection(cases, layer3Rows, varianceRows, settings);
  const closeness = scoreCloseness(cases, layer3Rows, varianceRows, settings);
  const caught = scoreCatch(cases, layer3Rows, varianceRows, settings);
  const gatedPass = arr(settings?.direction?.measures)
    .filter((m) => direction[m] && direction[m].gated === true)
    .every((m) => direction[m].pass === true);
  return {
    direction,
    closeness,
    catch: caught,
    ok: gatedPass && caught.pass === true && closeness.threshold_met !== false,
    settings_digest: settingsDigest(settings),
  };
}

/** Read the data through the injected readJson, ask the reader once for the case parcels' layer 3 rows, then score. ASYNC, no IO of its own. */
export async function runInc7(args) {
  const a = isObj(args) ? args : {};
  const paths = isObj(a.paths) ? a.paths : {};
  const cases = a.readJson(paths.cases);
  const varianceRows = a.readJson(paths.variance_rows);
  const settings = a.readJson(paths.settings);
  const checkResult = validateSettings(settings);
  if (checkResult.length > 0) throw invalidates(checkResult.join(';'));
  checkCases(cases);
  checkRowList(varianceRows, 'variance_rows');
  const parcelIds = [
    ...new Set(cases.map((c) => c.parcel_id).filter((p) => isStr(p) && p !== '')),
  ].sort();
  const layer3Rows = await a.reader.layer3Rows(parcelIds);
  return scoreInc7({ cases, layer3Rows, varianceRows, settings });
}
