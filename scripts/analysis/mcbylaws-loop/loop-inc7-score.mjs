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
const DIGEST_CHARS = 12;
const QUANTILE_METHODS = new Set(['floor_index', 'linear']);
// Integer scaling for the exact percent test: a decimal threshold percent is read at 1e-6.
const PCT_SCALE = 1e6;

const isObj = (x) => x !== null && typeof x === 'object' && !Array.isArray(x);
const isNum = (x) => typeof x === 'number' && Number.isFinite(x);
const isStr = (x) => typeof x === 'string';
const arr = (x) => (Array.isArray(x) ? x : []);
const isNothing = (x) => x === null || x === undefined;
const hasOwn = (o, key) => Object.prototype.hasOwnProperty.call(o, key);
const roundDp = (x, dp) => {
  const f = 10 ** dp;
  return Math.round(x * f) / f;
};
const invalidates = (detail) => new Error(`${SETTINGS_INVALID}:${detail}`);
const rejects = (detail) => new Error(`${INPUT_INVALID}:${detail}`);

// The percent threshold as an exact fraction (numerator over denominator) of an INTEGER percent: 90 -> 90/100.
// A decimal percent is read at 1e-6, so the arithmetic below stays on integers (n is an integer count).
function pctFraction(pct) {
  if (!isNum(pct)) return { num: 0, den: 100 };
  if (Number.isInteger(pct)) return { num: pct, den: 100 };
  return { num: Math.round(pct * PCT_SCALE), den: 100 * PCT_SCALE };
}

/** The number of correct cases a percent threshold requires, rounded up / down / nearest, in exact integer arithmetic. PURE. */
export function requiredCorrect(n, pct, rounding) {
  if (!ROUNDINGS.has(rounding)) throw invalidates(`rounding_unknown:${String(rounding)}`);
  const count = Number.isFinite(n) && n > 0 ? Math.trunc(n) : 0;
  const { num, den } = pctFraction(pct);
  const product = count * num;
  const whole = Math.floor(product / den);
  if (rounding === 'floor') return whole;
  if (rounding === 'ceil') return product % den === 0 ? whole : whole + 1;
  // nearest, halves up: 2 * (product - whole*den) >= den
  return 2 * (product - whole * den) >= den ? whole + 1 : whole;
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
    if (!QUANTILE_METHODS.has(c.quantile_method)) out.push(`quantile_method_unknown:${String(c.quantile_method)}`);
  }

  const b = isObj(s.buildings) ? s.buildings : null;
  if (!b) out.push('buildings_missing');
  else {
    if (!Array.isArray(b.list) || b.list.length === 0) out.push('buildings_list_missing');
    if (!Array.isArray(b.suite_roles)) out.push('suite_roles_missing');
    if (!Array.isArray(b.held)) out.push('buildings_held_missing');
    if (!Array.isArray(b.scoring) || b.scoring.length === 0) out.push('scoring_rule_missing');
    else {
      for (const rule of b.scoring) {
        if (!isObj(rule) || !Array.isArray(rule.score) || rule.score.length === 0) out.push('scoring_rule_missing');
        else if (rule.score.some((word) => !SUITE_WORDS.includes(word) && !arr(b.list).includes(word))) out.push('scoring_rule_missing');
      }
    }
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

// ---- the building rule (operator ruling 2026-11-15, "1,2 and 4 y" item 1) ----------------------------------
// Every table below is settings: the clause families, the displaced rows, the measure families, the row's unit.

/** The normalised clause path: no Chapter prefix, no dot before "(", no trailing ", Exception ..." part. PURE. */
export function clauseKey(clause) {
  if (!isStr(clause)) return null;
  let key = clause.trim();
  if (key === '') return null;
  key = key.replace(/^Chapter\s+/i, '');
  key = key.replace(/\.\(/, '(');
  key = key.replace(/,\s*Exception\b.*$/i, '');
  key = key.trim();
  return key === '' ? null : key;
}

const buildingsBlock = (settings) => (isObj(settings?.buildings) ? settings.buildings : {});

// First claimed table (in settings order) whose prefix matches the clause key.
function claimedBy(table, key, prefixField) {
  if (key === null) return null;
  for (const entry of arr(table)) {
    if (!isObj(entry)) continue;
    const prefixes = prefixField === 'clause_prefix' ? [entry.clause_prefix] : arr(entry.clause_prefixes);
    for (const prefix of prefixes) {
      if (isStr(prefix) && prefix !== '' && key.startsWith(prefix)) return entry;
    }
  }
  return null;
}

/** The building a variance row belongs to, from its CLAUSE family (the row's own building field is ignored). PURE. */
export function buildingOfRow(row, suiteBuildings, settings) {
  const b = buildingsBlock(settings);
  const key = clauseKey(isObj(row) ? row.clause : null);
  const suites = arr(suiteBuildings).filter(isStr);
  if (key === null) {
    return { building: isStr(b.no_clause_building) ? b.no_clause_building : null, rule_id: 'no_clause', displaced_by: null };
  }
  for (const d of arr(b.displaced)) {
    if (!isObj(d) || !isStr(d.clause_prefix)) continue;
    if (key.startsWith(d.clause_prefix) && suites.includes(d.when_case_has)) {
      return { building: d.building, rule_id: d.id, displaced_by: d.displaced_by };
    }
  }
  const claimed = claimedBy(b.clause_rules, key, 'clause_prefixes');
  if (claimed !== null) return { building: claimed.building, rule_id: claimed.id, displaced_by: null };
  return { building: isStr(b.default_building) ? b.default_building : null, rule_id: 'default', displaced_by: null };
}

/** The measure a row is about, from its CLAUSE family (an explicit measure wins). PURE. */
export function measureOfRow(row, settings) {
  if (!isObj(row)) return null;
  if (isStr(row.measure) && row.measure !== '') return row.measure;
  const b = buildingsBlock(settings);
  const claimed = claimedBy(b.measure_rules, clauseKey(row.clause), 'clause_prefixes');
  return claimed === null ? null : claimed.measure;
}

// The two suite words the scoring rules may name.
const SUITE_WORDS = ['main', 'suite'];

/** The buildings of a case, normalised (an old case without a buildings block is one main building). PURE. */
function buildingsOf(caseObj, settings) {
  const c = isObj(caseObj) ? caseObj : {};
  const b = buildingsBlock(settings);
  if (!isObj(c.buildings)) {
    const status = c.new_build === true ? 'new' : c.new_build === false ? 'existing' : 'new';
    return {
      main: { class: isStr(c.applicant_class) ? c.applicant_class : null, status, applicant: isObj(c.applicant) ? { ...c.applicant } : {} },
    };
  }
  const out = {};
  for (const name of arr(b.list)) {
    const entry = c.buildings[name];
    if (!isObj(entry)) continue;
    out[name] = {
      class: isStr(entry.class) ? entry.class : null,
      status: isStr(entry.status) ? entry.status : 'new',
      applicant: isObj(entry.applicant) ? { ...entry.applicant } : {},
    };
  }
  return out;
}

// The buildings of a case that are in the settings list, in list order.
function presentBuildings(caseObj, settings) {
  const b = buildingsBlock(settings);
  const all = buildingsOf(caseObj, settings);
  return arr(b.list).filter((name) => isStr(name) && isObj(all[name]));
}

/** One scored unit per building in scope, by buildings.list order and the scoring rules; a case without a buildings block is one main unit. PURE. */
export function unitsOf(caseObj, settings) {
  const c = isObj(caseObj) ? caseObj : {};
  const b = buildingsBlock(settings);
  const id = String(c.case);
  const all = buildingsOf(c, settings);
  const present = presentBuildings(c, settings);
  const mainStatus = isObj(all.main) ? all.main.status : null;
  const suites = present.filter((name) => arr(b.suite_roles).includes(name));
  const suiteNew = suites.some((name) => all[name].status === 'new');
  // A case with no main building of its own reads as existing: a suite-only case scores the suite alone.
  const mainFact = isObj(all.main) ? mainStatus : 'existing';
  // The first scoring rule whose "when" matches decides the score list.
  let score = null;
  for (const rule of arr(b.scoring)) {
    if (!isObj(rule) || !isObj(rule.when)) continue;
    const when = rule.when;
    if (typeof when.suite_new === 'boolean' && suiteNew !== when.suite_new) continue;
    if (Array.isArray(when.main_status) && !when.main_status.includes(mainFact)) continue;
    score = arr(rule.score);
    break;
  }
  if (score === null) score = ['main'];
  const names = [];
  for (const word of score) {
    if (word === 'main') {
      if (isObj(all.main)) names.push('main');
    } else if (word === 'suite') {
      for (const name of suites) names.push(name);
    } else if (isStr(word) && isObj(all[word])) {
      names.push(word);
    }
  }
  const held = new Set(arr(b.held));
  return names.map((name) => {
    const building = all[name];
    return {
      id: name === 'main' ? id : `${id}:${name}`,
      case: id,
      building: name,
      class: building.class,
      status: building.status,
      applicant: { ...building.applicant },
      parcel_id: isStr(c.parcel_id) ? c.parcel_id : null,
      held: held.has(name),
      new_build: building.status === 'new',
    };
  });
}

// The building a catch row's derivation reads: settings.buildings.row_scores_against names it, null -> no class.
function derivationBuilding(rowBuilding, settings) {
  const target = settings?.buildings?.row_scores_against?.[rowBuilding];
  if (!isStr(target) || target === '') return null;
  return target === 'suite' ? null : target;
}

// The applicant figure the alignment check reads: the row's own figure, else the figure of the building it scores against.
function alignFigure(vr, caseObj, measure, settings) {
  const own = toNum(vr.applicant_figure);
  if (own !== null) return own;
  if (!isObj(caseObj)) return null;
  const target = derivationBuilding(settings?.buildings?.row_scores_against?.[vr.building], settings);
  if (target === null) return null;
  const area = buildingsOf(caseObj, settings)[target];
  return isObj(area) ? figureOf(area.applicant, measure) : null;
}

// One duplicate fact per (case, building, city limit, applicant figure): all but the first row are skipped.
function dropDuplicates(rows, settings) {
  const rule = isObj(settings?.buildings?.duplicate_rule) ? settings.buildings.duplicate_rule : {};
  const reason = isStr(rule.skipped_reason) ? rule.skipped_reason : 'duplicate';
  const same = arr(rule.same);
  // The keep rule is data: keeping the DISPLACING clause means the row with displaced_by set survives.
  const displacing = rule.keep === 'displacing_clause';
  const kept = [];
  const skipped = [];
  const seen = new Map();
  for (const row of rows) {
    if (row.duplicate_exempt) {
      kept.push(row);
      continue;
    }
    const key = same.map((field) => `${field}:${String(row[field])}`).join('\u0000');
    const keptIndex = seen.get(key);
    if (keptIndex === undefined) {
      seen.set(key, kept.length);
      kept.push(row);
      continue;
    }
    if (displacing) {
      const prior = kept[keptIndex];
      const priorDisplaced = !isNothing(prior.displaced_by);
      const rowDisplaced = !isNothing(row.displaced_by);
      // The displacing row (the one whose clause is not itself displaced) wins; two rows of the same kind keep the first.
      if (rowDisplaced !== priorDisplaced) {
        if (!rowDisplaced) {
          kept[keptIndex] = row;
          skipped.push({ case: prior.case, ordinal: prior.ordinal, reason });
        } else {
          skipped.push({ case: row.case, ordinal: row.ordinal, reason });
        }
        continue;
      }
    }
    skipped.push({ case: row.case, ordinal: row.ordinal, reason });
  }
  return { rows: kept, skipped };
}

/** Every variance row prepared: building, rule, measure, clause key, off-scope and relative facts; duplicates skipped (as reported). PURE. */
export function prepareRows(cases, varianceRows, settings) {
  const k = isObj(settings?.catch) ? settings.catch : {};
  const byCase = new Map();
  for (const c of arr(cases)) {
    if (isObj(c)) byCase.set(String(c.case), c);
  }
  const measures = arr(settings?.direction?.measures);
  const offScopeRules = arr(k.off_scope);
  const relativeRules = arr(k.relative_rules);
  const prepared = [];
  for (const vr of arr(varianceRows)) {
    if (!isObj(vr)) continue;
    const caseId = String(vr.case);
    const key = clauseKey(vr.clause);
    const suites = presentBuildings(byCase.get(caseId), settings).filter((name) => arr(settings?.buildings?.suite_roles).includes(name));
    const of = buildingOfRow({ clause: vr.clause }, suites, settings);
    const measure = measureOfRow(vr, settings);
    const text = isStr(vr.text) ? vr.text : '';
    const lower = text.toLowerCase();
    let offScope = null;
    for (const entry of offScopeRules) {
      if (!isObj(entry)) continue;
      const byPrefix = key !== null && arr(entry.clause_prefixes).some((p) => isStr(p) && p !== '' && key.startsWith(p));
      const byText = lower !== '' && arr(entry.text_patterns).some((p) => isStr(p) && p !== '' && new RegExp(p, 'i').test(lower));
      if (byPrefix || byText) {
        offScope = { id: entry.id, cause: isStr(entry.cause) ? entry.cause : null };
        break;
      }
    }
    const relativeRule = relativeRules.find((entry) => {
      if (!isObj(entry)) return false;
      return key !== null && arr(entry.clause_prefixes).some((p) => isStr(p) && p !== '' && key.startsWith(p));
    });
    const relative = isObj(relativeRule) || vr.relative === true;
    const cause = isStr(vr.cause) && vr.cause !== '' ? vr.cause : offScope === null ? null : offScope.cause;
    prepared.push({
      ...vr,
      case: caseId,
      clause: isStr(vr.clause) ? vr.clause : null,
      clause_key: key,
      ordinal: isNothing(vr.ordinal) ? null : vr.ordinal,
      building: of.building,
      rule_id: of.rule_id,
      displaced_by: of.displaced_by,
      measure,
      off_scope: offScope === null ? null : offScope.id,
      relative,
      cause,
      duplicate_exempt: !(measures.includes(measure) && isNum(toNum(vr.city_limit)) && isNum(alignFigure(vr, byCase.get(caseId), measure, settings))),
    });
  }
  return dropDuplicates(prepared, settings);
}

/** The whole INC-7 input shape adapted to cases and variance rows: classes and statuses by the settings tables. PURE. */
export function adaptBuildingFile(file, settings) {
  const b = buildingsBlock(settings);
  const map = isObj(b.class_map) ? b.class_map : {};
  const statusRules = isObj(b.main_status) ? b.main_status : {};
  const patterns = arr(statusRules.new_text_patterns);
  const fallbackStatus = isStr(statusRules.default) ? statusRules.default : 'existing';
  const suiteStatus = isStr(b.suite_status_when_present) ? b.suite_status_when_present : 'new';
  const suiteRoles = arr(b.suite_roles);
  const cases = [];
  const varianceRows = [];
  for (const raw of arr(isObj(file) ? file.cases : null)) {
    if (!isObj(raw)) continue;
    const id = String(raw.case_id);
    const app = isObj(raw.applicant) ? raw.applicant : {};
    const type = isObj(app.building_type) ? app.building_type : {};
    const golden = isStr(type.golden_p_type) ? type.golden_p_type : '';
    const cls = isStr(map[golden]) ? map[golden] : null;
    const text = isStr(type.proposed_25_text) ? type.proposed_25_text.trim() : '';
    const mainStatus = patterns.some((p) => isStr(p) && new RegExp(p, 'i').test(text)) ? 'new' : fallbackStatus;
    const figure = (name) => toNum(isObj(app[name]) ? app[name].value : null);
    const main = {};
    for (const m of arr(settings?.direction?.measures)) main[m] = figure(m);
    // The suite class is the map of golden_p_suite_type; a value the map does not name adds no suite.
    const suiteRaw = isStr(type.golden_p_suite_type) ? type.golden_p_suite_type : '';
    const suiteClass = suiteRaw !== '' && isStr(map[suiteRaw]) ? map[suiteRaw] : null;
    const presentSuites = suiteRoles.filter((name) => name === suiteClass);
    // The main building always exists (its class is null when the type is unmapped: it scores as not evaluated).
    const buildings = { main: { class: cls, status: mainStatus, applicant: main } };
    for (const name of presentSuites) {
      const suiteFigures = {};
      for (const m of arr(settings?.direction?.measures)) {
        suiteFigures[m] = toNum(isObj(app[m]) ? app[m].suite_value : null);
      }
      buildings[name] = { class: suiteClass, status: suiteStatus, applicant: suiteFigures };
    }
    const newBuild = mainStatus === 'new';
    cases.push({ case: id, parcel_id: isStr(raw.parcel_id) ? raw.parcel_id : null, applicant_class: cls, new_build: newBuild, buildings });
    for (const v of arr(raw.varied_clauses)) {
      if (!isObj(v)) continue;
      const field = (name) => toNum(isObj(v[name]) ? v[name].value : null);
      const printed = isObj(v.permitted) && isStr(v.permitted.as_printed) ? v.permitted.as_printed : '';
      const requested = isObj(v.requested) && isStr(v.requested.as_printed) ? v.requested.as_printed : '';
      const granted = isStr(v.city_granted) ? v.city_granted : isObj(v.city_granted) ? v.city_granted.value : null;
      varianceRows.push({
        case: id,
        ordinal: v.ordinal,
        clause: isObj(v.clause) && isStr(v.clause.value) ? v.clause.value : null,
        city_row: true,
        granted,
        city_limit: field('permitted'),
        applicant_figure: field('requested'),
        text: `${printed} ${requested}`.trim(),
        measure: v.measure,
      });
    }
  }
  return { cases, varianceRows };
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

// (caseId, measure) -> the PREPARED rows of that pair, in input order (an ordinary variance row is prepared as is).
function varianceIndex(varianceRows, cases, settings) {
  const prepared = arr(varianceRows).some((r) => isObj(r) && r.duplicate_exempt !== undefined)
    ? arr(varianceRows)
    : prepareRows(cases, varianceRows, settings).rows;
  const map = new Map();
  for (const r of prepared) {
    if (!isObj(r)) continue;
    const key = `${String(r.case)}\u0000${String(r.measure)}`;
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(r);
  }
  return map;
}
const rowsFor = (index, caseId, measure) => index.get(`${String(caseId)}\u0000${String(measure)}`) ?? [];

// The variance that belongs to a UNIT: granted, and on a building the unit's building may count.
function hasVariance(index, unit, measure, settings) {
  const granted = new Set(arr(settings?.direction?.variance_granted_values));
  const buildings = arr(settings?.buildings?.variance_buildings?.[unit.building]);
  return rowsFor(index, unit.case, measure).some((r) => granted.has(r.granted) && buildings.includes(r.building));
}

const unitsOfAll = (cases, settings) => arr(cases).filter(isObj).flatMap((c) => unitsOf(c, settings));
const heldReason = (building) => `held:${building}`;

// The manifest of one run: what left each measure's denominator, the denominators, the units, the skipped rows,
// the held disclosures, and a digest over all of it (canonical JSON, hashed once at the end).
function buildManifest(cases, layer3Rows, varianceRows, settings, direction) {
  const measures = arr(settings?.direction?.measures);
  const units = unitsOfAll(cases, settings);
  const prepared = prepareRows(cases, varianceRows, settings);
  const excluded = [];
  for (const unit of units) {
    for (const measure of measures) {
      if (figureOf(unit.applicant, measure) === null) {
        excluded.push({ case: unit.id, measure, reason: settings?.direction?.excluded_when ?? 'applicant_figure_null' });
      }
    }
  }
  const denominators = {};
  for (const measure of measures) denominators[measure] = isObj(direction[measure]) ? direction[measure].denominator : 0;
  const disclosures = [];
  for (const unit of units) {
    if (!unit.held) continue;
    for (const measure of measures) {
      if (figureOf(unit.applicant, measure) === null) continue;
      disclosures.push({ unit: unit.id, building: unit.building, measure, reason: heldReason(unit.building) });
    }
  }
  const bare = {
    excluded,
    denominators,
    units: units.map((u) => u.id),
    skipped_rows: prepared.skipped,
    disclosures,
  };
  return { ...bare, digest: createHash('sha256').update(canonical(bare), 'utf8').digest('hex').slice(0, DIGEST_CHARS) };
}

/** The direction test per measure over the scored UNITS: counts, operator-chosen denominator, required count and the gate. PURE. */
export function scoreDirection(cases, layer3Rows, varianceRows, settings) {
  const d = isObj(settings?.direction) ? settings.direction : {};
  const index = varianceIndex(varianceRows, cases, settings);
  const gate = new Set(arr(d.gate_measures));
  const denomMode = d.denominator;
  const units = unitsOfAll(cases, settings);
  const out = {};
  for (const measure of arr(d.measures)) {
    const tol = isNum(d.tolerance?.[measure]) ? d.tolerance[measure] : 0;
    const wrongCases = [];
    const notEvaluatedCases = [];
    const excludedCases = [];
    let evaluated = 0;
    let correct = 0;
    let notEvaluated = 0;
    let noFigure = 0;
    for (const unit of units) {
      const applicant = figureOf(unit.applicant, measure);
      // D-2: a unit is excluded from the measure's denominator iff its applicant figure is null.
      if (applicant === null) {
        noFigure += 1;
        excludedCases.push(unit.id);
        continue;
      }
      const variance = hasVariance(index, unit, measure, settings);
      // A held building is not evaluated: its maximum is not read, and it counts as wrong in the denominator.
      const m = unit.held ? { value: null, reason: heldReason(unit.building) } : maxFor(layer3Rows, unit.parcel_id, unit.class, measure, settings);
      const vt = directionCase({ applicant, max: m.value, variance, tol });
      if (vt.status === 'no_applicant_figure') noFigure += 1;
      else if (vt.status === 'not_evaluated') {
        notEvaluated += 1;
        notEvaluatedCases.push(unit.id);
      } else {
        evaluated += 1;
        if (vt.status === 'correct') correct += 1;
        else wrongCases.push(unit.id);
      }
    }
    const denominator = denomMode === 'evaluated_cases' ? evaluated : evaluated + notEvaluated;
    const required = requiredCorrect(denominator, d.threshold_pct, d.count_rounding);
    // The test is the exact ratio (the operator's ruling D-2); `required` is the same count under count_rounding.
    const pass = denominator > 0 && correct >= required;
    out[measure] = {
      gated: gate.has(measure),
      cases: units.length,
      evaluated,
      correct,
      wrong: wrongCases.length,
      not_evaluated: notEvaluated,
      no_applicant_figure: noFigure,
      denominator,
      required,
      pass,
      wrong_cases: wrongCases,
      not_evaluated_cases: notEvaluatedCases,
      excluded_cases: excludedCases,
    };
  }
  return out;
}

function maxOfUnit(unit, layer3Rows, measure, settings) {
  return unit.held ? { value: null, reason: heldReason(unit.building) } : maxFor(layer3Rows, unit.parcel_id, unit.class, measure, settings);
}

function ratioValues(cases, layer3Rows, varianceRows, settings) {
  const cl = isObj(settings?.closeness) ? settings.closeness : {};
  const measure = cl.measure;
  const population = isObj(cl.population) ? cl.population : {};
  const index = varianceIndex(varianceRows, cases, settings);
  // The population is a FILTER TABLE over the UNITS: a boolean key must EQUAL the unit's fact (a false key excludes
  // the true units); a null or absent key filters nothing.
  const values = [];
  for (const unit of unitsOfAll(cases, settings)) {
    if (typeof population.new_build === 'boolean' && unit.new_build !== population.new_build) continue;
    const hasVar = hasVariance(index, unit, measure, settings);
    if (typeof population.variance_on_measure === 'boolean' && hasVar !== population.variance_on_measure) continue;
    const applicant = figureOf(unit.applicant, measure);
    if (applicant === null) continue;
    const m = maxOfUnit(unit, layer3Rows, measure, settings);
    // A zero or negative maximum is not a quantity to be close to: the ratio over it is no measurement at all.
    if (m.value === null || m.value <= 0) continue;
    values.push({ case: unit.id, ratio: roundDp(applicant / m.value, RATIO_DP) });
  }
  return values;
}

// The quantile by the settings method: floor_index reads sorted[floor(p*(n-1))]; linear interpolates (R type 7).
function quantile(sorted, p, method) {
  if (sorted.length === 0) return null;
  if (sorted.length === 1) return sorted[0];
  const pos = (sorted.length - 1) * p;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  if (method === 'floor_index') return sorted[lo];
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

// The ordinary median: the middle value, or the average of the two middle values for an even n, rounded.
function medianOf(sorted) {
  if (sorted.length === 0) return null;
  const mid = Math.floor(sorted.length / 2);
  const q = sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  return roundDp(q, RATIO_DP);
}

function spreadOf(kind, sorted, method) {
  if (sorted.length === 0) return null;
  if (kind === 'iqr') {
    const q1raw = quantile(sorted, 0.25, method);
    const q3raw = quantile(sorted, 0.75, method);
    return { kind, q1: roundDp(q1raw, RATIO_DP), q3: roundDp(q3raw, RATIO_DP), iqr: roundDp(q3raw - q1raw, RATIO_DP) };
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
  const spread = spreadOf(cl.spread, sorted, cl.quantile_method === 'linear' ? 'linear' : 'floor_index');
  const threshold = isNum(cl.threshold) ? cl.threshold : null;
  return {
    measure: cl.measure,
    n: values.length,
    median,
    spread,
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
  // A rule that names off_scope requires the row's off-scope FACT to be true (null is the no-reason sentinel).
  const offScopeFact = isNothing(f.off_scope) ? null : f.off_scope;
  for (const r of arr(k.class_rules)) {
    if (!isObj(r)) continue;
    if (hasOwn(r, 'city_row') && r.city_row !== f.city_row) continue;
    if (arr(r.our_verdict).length > 0 && !arr(r.our_verdict).includes(verdict)) continue;
    if (r.limit_match === true && match !== true) continue;
    if (r.limit_match === false && match !== false) continue;
    if (typeof r.relative === 'boolean' && r.relative !== (f.relative === true)) continue;
    if (hasOwn(r, 'off_scope') && (typeof r.off_scope === 'boolean' ? r.off_scope !== (offScopeFact !== null) : r.off_scope !== offScopeFact)) continue;
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
  const complete = isObj(k.complete_inputs) ? k.complete_inputs : {};
  const completeMeasures = arr(complete.measures);
  const requireClass = complete.require_class === true;
  const held = new Set(arr(settings?.buildings?.held));

  // The row's own building reads the unit the settings send it to; a held unit or no building is NOT EVALUATED.
  const deriveFor = (prepared, c, measure) => {
    const target = derivationBuilding(prepared.building, settings);
    if (target === null) return { max: null, applicant: null, class: null, held: false };
    const area = isObj(c) ? buildingsOf(c, settings)[target] : null;
    const isHeld = held.has(target);
    const l3Parcel = isObj(c) && isStr(c.parcel_id) ? c.parcel_id : null;
    const max = isObj(area) && !isHeld && !isNothing(area.class)
      ? maxFor(layer3Rows, l3Parcel, area.class, measure, settings)
      : { value: null };
    return { max: max.value, applicant: isObj(area) ? figureOf(area.applicant, measure) : null, class: isObj(area) ? area.class : null, held: isHeld, parcel_id: l3Parcel, area: isObj(area) ? area : null };
  };

  const rows = [];
  for (const vr of prepareRows(cases, varianceRows, settings).rows) {
    const caseId = String(vr.case);
    const measure = String(vr.measure);
    const c = byCase.get(caseId);
    const derived = deriveFor(vr, c, measure);
    const derivedLimit = vr.our_limit === undefined ? derived.max : toNum(vr.our_limit);
    const applicant = toNum(vr.applicant_figure) ?? derived.applicant;
    const tol = isNum(d.tolerance?.[measure]) ? d.tolerance[measure] : 0;
    const offScope = isNothing(vr.off_scope) ? null : vr.off_scope;
    const relative = vr.relative === true;
    // An off-scope row is never judged on our figure: it is missed however the numbers fall.
    const ourVerdict = offScope !== null ? verdicts.not_evaluated : verdictOf(vr, derivedVerdict(applicant, derived.max, tol, verdicts));
    const cityLimit = toNum(vr.city_limit);
    const limitMatchValue = offScope !== null || relative ? null : limitMatch(cityLimit, derivedLimit, settings);
    const cityRow = vr.city_row === true;
    const cls = classifyRow({ city_row: cityRow, our_verdict: ourVerdict, limit_match: limitMatchValue, relative, off_scope: offScope }, settings);
    let category = null;
    if (cls !== k.unclassified_class) {
      const given = isStr(vr.category) ? vr.category : '';
      category = measured.has(given) ? given : otherCategory;
    }
    const classOk = derived.class !== null || requireClass !== true;
    const completeInputs = classOk && completeMeasures.every((m) => figureOf(derived.area?.applicant, m) !== null);
    rows.push({
      case: caseId,
      measure,
      clause: vr.clause,
      ordinal: vr.ordinal,
      building: vr.building,
      city_row: cityRow,
      our_verdict: ourVerdict,
      city_limit: cityLimit,
      our_limit: isNum(derivedLimit) ? derivedLimit : null,
      limit_match: limitMatchValue,
      category,
      class: cls,
      off_scope: offScope,
      relative,
      cause: isStr(vr.cause) && vr.cause !== '' ? vr.cause : null,
      complete_inputs: completeInputs,
    });
  }

  const counts = {};
  for (const r of rows) counts[r.class] = (counts[r.class] ?? 0) + 1;
  const denominator = rows.filter((r) => denominatorClasses.has(r.class)).length;

  const rates = {};
  for (const t of arr(k.thresholds)) {
    if (!isObj(t) || !isStr(t.id)) continue;
    const classes = arr(t.classes);
    const hit = rows.filter(
      (r) =>
        classes.includes(r.class) &&
        (t.category === undefined || t.category === null || r.category === t.category) &&
        (t.complete_inputs !== true || r.complete_inputs === true) &&
        (t.named_cause !== false || isNothing(r.cause) || r.cause === ''),
    );
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
    manifest: buildManifest(cases, layer3Rows, varianceRows, settings, direction),
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
