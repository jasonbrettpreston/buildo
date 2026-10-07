// SPEC LINK: docs/specs/01-pipeline/68_mcbylaw_standard.md §6.5 (closed vocabularies, the `feeds` maps), §6.4 rule 5
//            (closed, versioned vocabularies; "none" written), §7.4 (units bind), §7.5 (the M-50 building-type list);
//            docs/specs/01-pipeline/69_mcbylaw_policy.md M-50, M-52; docs/reports/mcbylaw-phase1-plan.md S5
//
// The vocabulary (`scripts/seeds/bylaw/vocab.json`) and the two `feeds` maps (Spec 69 M-52). PURE except loadVocab().
//
//   checkVocab(vocab)                 → {pass, violations, checked}   closedness + internal references
//   evaluatorVocab(vocab)             → the shape evaluate.mjs makeContext() reads (derived, never kept twice)
//   feedsOf(unit, vocab)              → {pairs:[{structure, aspect}], problems:[]}   generated, never keyed
//   checkFeedsTotality(units, vocab)  → {pass, violations, checked, counts}   the G-SHAPE totality arm (M-52)
//   selfTest()                        → one known-bad fixture per reason code + a good twin
//
// Reason codes (closed):
//   vocab_missing_field          a required top-level field is absent or of the wrong type
//   vocab_duplicate              a closed list repeats a member
//   vocab_unit_invalid           a dsl_target / dsl_input / label / overlay unit outside vocab.dsl_unit
//   vocab_aspect_unmapped        a dsl_target without an aspect in vocab.feeds.aspect
//   vocab_structure_unmapped     a building_type without a structure in vocab.feeds.structure
//   vocab_synonym                two dsl_targets share an evidence pattern, or a name is both a target and an input
//   vocab_reference_invalid      an internal reference names nothing (parent type, user_input, banned target,
//                                code_registry pair, M-50 list, lot_condition user_input, input definition id shape)
//   vocab_pattern_invalid        a declared regex (topic, slicer exclusion) does not compile
//   vocab_not_evaluated_mismatch vocab.not_evaluated_reason != evaluate.mjs NOT_EVALUATED_CODES (both directions)
//   feeds_unresolved             a LIMIT / PERMIT / PROHIBIT unit resolves to no (structure, aspect) pair
//   feeds_target_unknown         a unit's target is not a vocab.dsl_target (nor "none")
//   feeds_building_type_unknown  a unit's application names a building type outside vocab.building_type

import fs from 'node:fs';
import path from 'node:path';
import { NOT_EVALUATED_CODES } from './evaluate.mjs';

export const VOCAB_REL = 'scripts/seeds/bylaw/vocab.json';

export const REASON_CODES = Object.freeze([
  'vocab_missing_field',
  'vocab_duplicate',
  'vocab_unit_invalid',
  'vocab_aspect_unmapped',
  'vocab_structure_unmapped',
  'vocab_synonym',
  'vocab_reference_invalid',
  'vocab_pattern_invalid',
  'vocab_not_evaluated_mismatch',
  'feeds_unresolved',
  'feeds_target_unknown',
  'feeds_building_type_unknown',
]);

/** Closed lists that must be arrays of unique strings. */
const LIST_FIELDS = Object.freeze([
  'archetype', 'bound', 'value_form', 'layer', 'applies_to_part', 'relevance', 'row_status', 'field_status', 'gate_state',
  'dsl_unit', 'zone', 'uses', 'requirement', 'calculation_handling_status', 'not_modelled_reason',
  'literal_not_expressed_reason', 'field_failure_reason', 'not_evaluated_reason', 'vector_status', 'heuristic_reason',
  'adjudication_kind', 'user_input', 'code_roots', 'dsl_input_null_reason', 'input_fidelity_status',
]);
/** Fields that must be plain objects. */
const MAP_FIELDS = Object.freeze(['scope', 'topic', 'dsl_target', 'dsl_input', 'label_letter', 'overlay_code', 'building_type', 'feeds', 'lot_condition', 'disclosure_reason', 'displacement_triggers', 'definitions_matcher', 'slicer']);

const isMap = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const isStr = (v) => typeof v === 'string' && v.length > 0;
const cmpStr = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

/** Read the committed vocab.json (the one I/O function here). */
export function loadVocab(root) {
  return JSON.parse(fs.readFileSync(path.join(root, VOCAB_REL), 'utf8'));
}

function compiles(pattern, flags = '') {
  try {
    new RegExp(pattern, flags);
    return true;
  } catch {
    return false;
  }
}

/** Closedness + internal references of a vocab. PURE. Collects every violation. */
export function checkVocab(vocab) {
  const v = [];
  if (!isMap(vocab)) return { pass: false, violations: ['vocab_missing_field: vocab is not an object'], checked: 0 };
  if (!isStr(vocab.version)) v.push('vocab_missing_field: version');
  if (!Number.isSafeInteger(vocab.max_snapshot_age_days) || vocab.max_snapshot_age_days <= 0) v.push('vocab_missing_field: max_snapshot_age_days');
  for (const f of LIST_FIELDS) {
    const l = vocab[f];
    if (!Array.isArray(l) || l.length === 0 || l.some((x) => !isStr(x))) {
      v.push(`vocab_missing_field: ${f}`);
      continue;
    }
    const seen = new Set();
    for (const x of l) {
      if (seen.has(x)) v.push(`vocab_duplicate: ${f} repeats ${x}`);
      seen.add(x);
    }
  }
  for (const f of MAP_FIELDS) if (!isMap(vocab[f])) v.push(`vocab_missing_field: ${f}`);
  if (v.some((x) => x.startsWith('vocab_missing_field'))) return { pass: false, violations: v, checked: 0 };

  const units = new Set(vocab.dsl_unit);
  const aspects = new Set(Array.isArray(vocab.feeds.aspect) ? vocab.feeds.aspect : []);
  const structures = new Set(Array.isArray(vocab.feeds.structure) ? vocab.feeds.structure : []);
  if (!aspects.size || !structures.size) v.push('vocab_missing_field: feeds.aspect / feeds.structure');
  const archetypes = new Set(vocab.archetype);
  for (const a of vocab.feeds.requires_feeds || []) if (!archetypes.has(a)) v.push(`vocab_reference_invalid: feeds.requires_feeds names ${a}`);
  for (const [a, asp] of Object.entries(vocab.feeds.aspect_without_target || {})) {
    if (!archetypes.has(a)) v.push(`vocab_reference_invalid: feeds.aspect_without_target names archetype ${a}`);
    if (!aspects.has(asp)) v.push(`vocab_aspect_unmapped: feeds.aspect_without_target.${a} = ${asp}`);
  }

  // dsl_target: unit, aspect, patterns; no synonyms (a shared pattern, or a name that is also an input).
  const patternOwner = new Map();
  for (const name of Object.keys(vocab.dsl_target).sort()) {
    const t = vocab.dsl_target[name];
    if (!isMap(t)) {
      v.push(`vocab_missing_field: dsl_target.${name}`);
      continue;
    }
    if (!units.has(t.unit)) v.push(`vocab_unit_invalid: dsl_target.${name} unit ${t.unit}`);
    if (!aspects.has(t.aspect)) v.push(`vocab_aspect_unmapped: dsl_target.${name} aspect ${t.aspect}`);
    if (!isStr(t.concept)) v.push(`vocab_missing_field: dsl_target.${name}.concept`);
    if (!Array.isArray(t.patterns) || t.patterns.length === 0 || t.patterns.some((p) => !isStr(p))) v.push(`vocab_missing_field: dsl_target.${name}.patterns`);
    for (const p of t.patterns || []) {
      const k = String(p).toLowerCase();
      if (patternOwner.has(k)) v.push(`vocab_synonym: dsl_target ${patternOwner.get(k)} and ${name} share the pattern "${p}"`);
      else patternOwner.set(k, name);
    }
    if (Object.hasOwn(vocab.dsl_input, name)) v.push(`vocab_synonym: ${name} is both a dsl_target and a dsl_input`);
  }
  // dsl_input: unit, and exactly one of definition | null_reason (G-READ map totality lives in definitions.mjs).
  const nullReasons = new Set(vocab.dsl_input_null_reason);
  for (const name of Object.keys(vocab.dsl_input).sort()) {
    const i = vocab.dsl_input[name];
    if (!isMap(i)) {
      v.push(`vocab_missing_field: dsl_input.${name}`);
      continue;
    }
    if (!units.has(i.unit)) v.push(`vocab_unit_invalid: dsl_input.${name} unit ${i.unit}`);
    if (i.definition !== undefined && !/^\d{1,3}\.\d{1,3}\(\d{1,4}\)$/.test(String(i.definition))) v.push(`vocab_reference_invalid: dsl_input.${name}.definition ${i.definition}`);
    if (i.null_reason !== undefined && !nullReasons.has(i.null_reason)) v.push(`vocab_reference_invalid: dsl_input.${name}.null_reason ${i.null_reason}`);
  }
  for (const f of ['label_letter', 'overlay_code']) for (const [k, x] of Object.entries(vocab[f])) if (!isMap(x) || !units.has(x.unit)) v.push(`vocab_unit_invalid: ${f}.${k}`);

  // building_type: structure, parent, residential (the M-50 list).
  const types = vocab.building_type;
  for (const name of Object.keys(types).sort()) {
    const t = types[name];
    if (!isMap(t) || !structures.has(t.structure)) v.push(`vocab_structure_unmapped: building_type.${name}`);
    if (t && t.parent !== undefined && (!Object.hasOwn(types, t.parent) || t.parent === name || types[t.parent].parent !== undefined)) v.push(`vocab_reference_invalid: building_type.${name}.parent ${t.parent}`);
    if (t && t.residential !== undefined && t.residential !== true) v.push(`vocab_reference_invalid: building_type.${name}.residential must be true or absent`);
  }
  if (!Object.values(types).some((t) => t && t.residential === true)) v.push('vocab_reference_invalid: building_type has no residential type (the M-50 list is empty)');
  if (!Object.hasOwn(types, 'any') || types.any.structure !== 'any') v.push('vocab_reference_invalid: building_type.any must exist with structure any');

  // lot_condition tokens; a token read from a user input names one.
  const userInputs = new Set(vocab.user_input);
  for (const [tok, x] of Object.entries(vocab.lot_condition)) {
    if (!isMap(x)) v.push(`vocab_missing_field: lot_condition.${tok}`);
    else if (x.user_input !== undefined && !userInputs.has(x.user_input)) v.push(`vocab_reference_invalid: lot_condition.${tok}.user_input ${x.user_input}`);
  }

  // scope reasons
  const oos = vocab.scope.out_of_scope_reason;
  if (!isMap(oos)) v.push('vocab_missing_field: scope.out_of_scope_reason');
  else for (const [r, x] of Object.entries(oos)) if (!isMap(x) || !['mechanical', 'judgment'].includes(x.kind)) v.push(`vocab_reference_invalid: scope.out_of_scope_reason.${r}.kind`);
  if (!isMap(vocab.scope.page_rule_reason)) v.push('vocab_missing_field: scope.page_rule_reason');

  // not_evaluated_reason == the evaluator's closed set, both directions.
  const nev = new Set(vocab.not_evaluated_reason);
  for (const c of NOT_EVALUATED_CODES) if (!nev.has(c)) v.push(`vocab_not_evaluated_mismatch: evaluate.mjs code ${c} missing from vocab`);
  for (const c of nev) if (!NOT_EVALUATED_CODES.includes(c)) v.push(`vocab_not_evaluated_mismatch: vocab code ${c} unknown to evaluate.mjs`);

  // code linkage (Lane C): banned refs and the feeds registry.
  for (const b of vocab.banned_code_refs || []) {
    if (!isMap(b) || !isStr(b.ref) || !isStr(b.reason)) v.push('vocab_missing_field: banned_code_refs entry needs {ref, reason}');
    for (const t of (b && b.targets) || []) if (!Object.hasOwn(vocab.dsl_target, t)) v.push(`vocab_reference_invalid: banned_code_refs ${b.ref} target ${t}`);
  }
  const pairs = new Set();
  for (const e of vocab.code_registry || []) {
    if (!isMap(e) || !structures.has(e.structure) || !aspects.has(e.aspect) || !Array.isArray(e.refs) || e.refs.length === 0) {
      v.push(`vocab_reference_invalid: code_registry entry ${JSON.stringify(e)}`);
      continue;
    }
    const k = `${e.structure}/${e.aspect}`;
    if (pairs.has(k)) v.push(`vocab_duplicate: code_registry pair ${k}`);
    pairs.add(k);
  }

  // declared regexes compile
  for (const [name, t] of Object.entries(vocab.topic)) for (const p of (t && t.article_patterns) || []) if (!compiles(p)) v.push(`vocab_pattern_invalid: topic.${name} ${p}`);
  for (const x of vocab.slicer.anti_vacuity_exclusions || []) if (!isStr(x.kind) || !compiles(x.pattern, x.flags)) v.push(`vocab_pattern_invalid: slicer exclusion ${x.kind}`);

  const checked = Object.keys(vocab.dsl_target).length + Object.keys(vocab.dsl_input).length + Object.keys(types).length + Object.keys(vocab.lot_condition).length;
  return { pass: v.length === 0, violations: v, checked };
}

/**
 * The evaluator's vocab view (evaluate.mjs makeContext): dsl_target / dsl_input / label_letter / overlay_code as
 * {name:{unit}}, zone, user_input, and the DERIVED building_type_residential (M-50 list), building_type_parent and
 * lot_condition_threshold. PURE.
 */
export function evaluatorVocab(vocab) {
  const types = vocab.building_type || {};
  const names = Object.keys(types).sort(cmpStr);
  return {
    building_type_parent: Object.fromEntries(names.filter((n) => types[n].parent).map((n) => [n, types[n].parent])),
    building_type_residential: names.filter((n) => types[n].residential === true),
    dsl_input: vocab.dsl_input,
    dsl_target: vocab.dsl_target,
    label_letter: vocab.label_letter,
    lot_condition_threshold: Object.keys(vocab.lot_condition || {}).filter((k) => vocab.lot_condition[k].threshold === true).sort(cmpStr),
    overlay_code: vocab.overlay_code,
    user_input: vocab.user_input,
    zone: vocab.zone,
  };
}

const tokenOf = (x) => (typeof x === 'string' ? x : x && typeof x === 'object' ? x.token : undefined);

/**
 * `feeds` of one clause unit (Spec 69 M-52): structure from the unit's `application` building types through
 * vocab.building_type.structure; aspect from its `target` through vocab.dsl_target.aspect (a unit with no target
 * takes vocab.feeds.aspect_without_target[archetype]). Generated, never keyed. PURE.
 * @returns {{pairs: {structure: string, aspect: string}[], problems: string[]}}
 */
export function feedsOf(unit, vocab) {
  const problems = [];
  const types = (unit && unit.application && Array.isArray(unit.application.building_types) ? unit.application.building_types : []).map(tokenOf);
  const structures = new Set();
  for (const t of types) {
    const bt = vocab.building_type[t];
    if (!bt) problems.push(`feeds_building_type_unknown: ${unit.unit_id} building type ${t}`);
    else structures.add(bt.structure);
  }
  let aspect = null;
  const target = unit && unit.target;
  if (target && target !== 'none') {
    const t = vocab.dsl_target[target];
    if (!t) problems.push(`feeds_target_unknown: ${unit.unit_id} target ${target}`);
    else aspect = t.aspect;
  } else {
    aspect = (vocab.feeds.aspect_without_target || {})[unit && unit.archetype] || null;
  }
  const pairs = [];
  if (aspect) for (const s of [...structures].sort(cmpStr)) pairs.push({ structure: s, aspect });
  return { pairs, problems };
}

/**
 * G-SHAPE totality arm (Spec 69 M-52): every LIMIT / PERMIT / PROHIBIT unit resolves to >= 1 (structure, aspect)
 * pair and names only vocab targets / building types. Counts per pair are returned for the renderer. PURE.
 */
export function checkFeedsTotality(units, vocab) {
  const v = [];
  const counts = {};
  const need = new Set(vocab.feeds.requires_feeds || []);
  let checked = 0;
  for (const u of units || []) {
    if (!need.has(u.archetype)) continue;
    checked++;
    const { pairs, problems } = feedsOf(u, vocab);
    v.push(...problems);
    if (pairs.length === 0 && problems.length === 0) v.push(`feeds_unresolved: ${u.unit_id} (${u.archetype}, target ${u.target || 'none'}) resolves to no (structure, aspect) pair`);
    for (const p of pairs) counts[`${p.structure}/${p.aspect}`] = (counts[`${p.structure}/${p.aspect}`] || 0) + 1;
  }
  return { pass: v.length === 0, violations: v, checked, counts: Object.fromEntries(Object.entries(counts).sort((a, b) => cmpStr(a[0], b[0]))) };
}

// ---------------------------------------------------------------- self-test

/** A minimal valid vocab for fixtures (the good twin). */
export function fixtureVocab() {
  return {
    version: 'fixture',
    max_snapshot_age_days: 90,
    archetype: ['LIMIT', 'PERMIT', 'PROHIBIT', 'REQUIRE', 'DEFINE', 'DISAPPLY', 'INCLUDE', 'PREVAILING', 'PROCEDURAL', 'UNUSUAL'],
    bound: ['min', 'max', 'exact'],
    value_form: ['literal', 'none'],
    layer: ['base'],
    applies_to_part: ['whole'],
    relevance: ['envelope'],
    row_status: ['complete', 'pending'],
    field_status: ['verified'],
    gate_state: ['pass', 'fail', 'not_run'],
    dsl_unit: ['m', 'm2', 'pct', 'storeys', 'units', 'ratio'],
    zone: ['RD'],
    uses: ['dwelling_unit'],
    requirement: ['parking_in_building'],
    calculation_handling_status: ['modelled'],
    not_modelled_reason: ['needs_user_input'],
    literal_not_expressed_reason: ['cross_reference_value'],
    field_failure_reason: ['verbatim_changed'],
    not_evaluated_reason: [...NOT_EVALUATED_CODES],
    vector_status: ['by_law_expected'],
    heuristic_reason: ['tolerance'],
    adjudication_kind: ['disagreement'],
    user_input: ['building_type', 'has_secondary_suite'],
    code_roots: ['scripts/lib/max-build.js'],
    dsl_input_null_reason: ['not_a_measurement'],
    input_fidelity_status: ['matches', 'approximates', 'differs', 'unknown'],
    scope: { out_of_scope_reason: { deleted_slot: { kind: 'mechanical' } }, page_rule_reason: { other_zone_category: 'x' } },
    topic: { setbacks: { article_patterns: ['\\.40\\.70$'] } },
    dsl_target: {
      height_m: { unit: 'm', aspect: 'envelope', concept: 'max height', patterns: ['maximum height'] },
      side_setback_m: { unit: 'm', aspect: 'envelope', concept: 'min side yard setback', patterns: ['side yard setback'] },
    },
    dsl_input: { lot_frontage_m: { unit: 'm', definition: '800.50(445)' }, dwelling_units: { unit: 'units', null_reason: 'not_a_measurement' } },
    label_letter: { f: { unit: 'm' } },
    overlay_code: { HT: { unit: 'm' } },
    building_type: {
      detached_house: { structure: 'principal', residential: true },
      duplex: { structure: 'principal', parent: 'detached_houseplex' },
      detached_houseplex: { structure: 'principal', residential: true },
      garden_suite: { structure: 'suite' },
      any: { structure: 'any' },
    },
    feeds: { structure: ['principal', 'suite', 'ancillary', 'any'], aspect: ['envelope', 'use_permission'], requires_feeds: ['LIMIT', 'PERMIT', 'PROHIBIT'], aspect_without_target: { PERMIT: 'use_permission', PROHIBIT: 'use_permission' } },
    lot_condition: { corner_lot: {}, frontage_band: { threshold: true }, has_secondary_suite: { user_input: 'has_secondary_suite' } },
    disclosure_reason: { source_defect: ['garbled_character'] },
    displacement_triggers: { phrases: ['Despite'], not_an_override: ['subordinate_reference'] },
    definitions_matcher: { case_insensitive: true },
    slicer: { anti_vacuity_exclusions: [{ kind: 'tag', pattern: '\\[[^\\]]*\\]', flags: 'g' }] },
    banned_code_refs: [{ ref: 'parcels.bylaw_standard_setback_m', reason: 'STAND_SET', targets: ['side_setback_m'] }],
    code_registry: [{ structure: 'principal', aspect: 'envelope', refs: ['scripts/lib/max-build.js'] }],
  };
}

const clone = (x) => JSON.parse(JSON.stringify(x));
const mut = (fn) => () => {
  const v = fixtureVocab();
  fn(v);
  return v;
};

/** Known-bad fixtures, one per vocab reason code; each must fail for exactly its reason. */
export const VOCAB_FIXTURES = Object.freeze([
  { reason: 'vocab_missing_field', vocab: mut((v) => delete v.zone) },
  { reason: 'vocab_duplicate', vocab: mut((v) => v.zone.push('RD')) },
  { reason: 'vocab_unit_invalid', vocab: mut((v) => (v.dsl_target.height_m.unit = 'feet')) },
  { reason: 'vocab_aspect_unmapped', vocab: mut((v) => delete v.dsl_target.height_m.aspect) },
  { reason: 'vocab_structure_unmapped', vocab: mut((v) => (v.building_type.garden_suite.structure = 'shed')) },
  { reason: 'vocab_synonym', vocab: mut((v) => (v.dsl_target.side_setback_m.patterns = ['Maximum Height'])) },
  { reason: 'vocab_reference_invalid', vocab: mut((v) => (v.building_type.duplex.parent = 'quadplex')) },
  { reason: 'vocab_pattern_invalid', vocab: mut((v) => (v.topic.setbacks.article_patterns = ['(unclosed'])) },
  { reason: 'vocab_not_evaluated_mismatch', vocab: mut((v) => v.not_evaluated_reason.pop()) },
]);

export const FEEDS_FIXTURES = Object.freeze([
  { reason: null, units: [{ unit_id: 'u#(A)', archetype: 'LIMIT', target: 'height_m', application: { building_types: ['garden_suite'] } }, { unit_id: 'p#(B)', archetype: 'PERMIT', target: 'none', application: { building_types: ['duplex'] } }] },
  { reason: 'feeds_unresolved', units: [{ unit_id: 'u#(A)', archetype: 'LIMIT', target: 'height_m', application: { building_types: [] } }] },
  { reason: 'feeds_target_unknown', units: [{ unit_id: 'u#(A)', archetype: 'LIMIT', target: 'lot_frontage_min_m', application: { building_types: ['any'] } }] },
  { reason: 'feeds_building_type_unknown', units: [{ unit_id: 'u#(A)', archetype: 'LIMIT', target: 'height_m', application: { building_types: ['castle'] } }] },
]);

/** Every vocab / feeds reason code fails its fixture for that reason (and only it); the good twins pass. */
export function selfTest() {
  const results = [];
  const good = checkVocab(fixtureVocab());
  results.push({ name: 'vocab good twin', expected: null, got: good.violations, ok: good.pass });
  for (const f of VOCAB_FIXTURES) {
    const r = checkVocab(f.vocab());
    const codes = [...new Set(r.violations.map((x) => x.split(':')[0]))];
    results.push({ name: f.reason, expected: f.reason, got: codes, ok: !r.pass && codes.length === 1 && codes[0] === f.reason });
  }
  for (const f of FEEDS_FIXTURES) {
    const r = checkFeedsTotality(clone(f.units), fixtureVocab());
    const codes = [...new Set(r.violations.map((x) => x.split(':')[0]))];
    const ok = f.reason === null ? r.pass : !r.pass && codes.length === 1 && codes[0] === f.reason;
    results.push({ name: f.reason || 'feeds good twin', expected: f.reason, got: codes, ok });
  }
  const covered = new Set(results.map((r) => r.expected).filter(Boolean));
  for (const c of REASON_CODES) if (!covered.has(c)) results.push({ name: `fixture for ${c}`, expected: c, got: [], ok: false });
  return { pass: results.every((r) => r.ok), results };
}
