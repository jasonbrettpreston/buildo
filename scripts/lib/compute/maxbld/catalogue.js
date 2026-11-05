// SPEC LINK: docs/specs/01-pipeline/69a_mcbylaw_register.md M-72, M-377 (MB-31 Layer 3 step; plan sections 2, 7 row 2)
// MB-31 B8: catalogue invariants (contract C5). Pure functions over parsed seed JSON; never reads files, env or clock.
'use strict';

const crypto = require('node:crypto');
const dsl = require('../../../analysis/bylaw/dsl.mjs');

const SCHEMA = 'layer3-catalogue-v1';
const LITERALS = [0, 1, 2];
// M-481 (Q-CONF a): the closed confidence list of a switchboard reading row
const CONFIDENCE = Object.freeze(['high', 'medium', 'medium-low', 'low']);

function toList(x) {
  return Array.isArray(x) ? x : [];
}

function isObject(x) {
  return !!x && typeof x === 'object' && !Array.isArray(x);
}

function entities(catalogue, key) {
  return toList(isObject(catalogue) ? catalogue[key] : null).filter(isObject);
}

function rowsOf(catalogue) {
  return entities(catalogue, 'rows');
}

function idsOf(list) {
  return toList(list).map((x) => (isObject(x) ? x.id : x));
}

function duplicateIds(list) {
  const seen = new Set();
  const dup = new Set();
  for (const id of idsOf(list)) {
    if (seen.has(id)) dup.add(id);
    seen.add(id);
  }
  return [...dup];
}

/** C1 `U`: setting / target units, the row + fact + geometry name space, and the lot-flag tokens. */
function unitsFor(catalogue, vocab) {
  const lv = {};
  const l2 = {};
  const names = {};
  for (const s of entities(catalogue, 'settings')) lv[s.id] = s.unit;
  const targets = isObject(vocab) && isObject(vocab.dsl_target) ? vocab.dsl_target : {};
  for (const [id, entry] of Object.entries(targets)) l2[id] = isObject(entry) ? entry.unit : entry;
  for (const key of ['geometry_inputs', 'facts']) for (const e of entities(catalogue, key)) names[e.id] = e.unit;
  for (const r of rowsOf(catalogue)) if (r.form !== 'status') names[r.id] = r.unit;
  return { lv, l2, names, flags: idsOf(entities(catalogue, 'lot_flags')) };
}

/** C3 `settingDecls`: the catalogue entry plus the seeded default, minimum and maximum. */
function settingDecls(catalogue, logicVariables) {
  const vars = isObject(logicVariables) ? logicVariables : {};
  const out = {};
  for (const s of entities(catalogue, 'settings')) {
    const seed = isObject(vars[s.id]) ? vars[s.id] : {};
    const decl = { ...s, unit: s.unit, min: seed.min, max: seed.max, default: seed.default };
    out[s.id] = decl;
  }
  return out;
}

/** C3 `settingVals`: the seeded value of every setting that has a seed. */
function settingVals(catalogue, logicVariables) {
  const vars = isObject(logicVariables) ? logicVariables : {};
  const out = {};
  for (const s of entities(catalogue, 'settings')) {
    const seed = vars[s.id];
    if (isObject(seed) && 'value' in seed) out[s.id] = { value: seed.value };
    else if (isObject(seed) && 'default' in seed) out[s.id] = { value: seed.default };
  }
  return out;
}

/** Every row a catalogue row names, restricted to row ids, in catalogue order. */
function refsOf(row, rowIds) {
  if (!row || row.form === 'status' || typeof row.expression !== 'string') return [];
  const out = [];
  // M-476: a row is ordered after every row its own formula AND each of its revisions reads
  for (const src of [row.expression, ...revisionsOf(row).map((v) => v.expression)]) {
    if (typeof src !== 'string') continue;
    try {
      const refs = dsl.l3RefsOf(dsl.parseExpr(src, { layer: 'l3' }));
      for (const id of toList(refs.names)) if (rowIds.has(id) && !out.includes(id)) out.push(id);
    } catch (e) {
      // a parse error is reported by exprViolations; it adds no order edge
    }
  }
  return out;
}

/** M-476: the increment revisions an increment-1 row carries (each {increment, switch, expression, clauses, rules}). */
function revisionsOf(row) {
  return toList(isObject(row) ? row.revisions : null).filter(isObject);
}

/** Row ids in dependency order (a row comes after every row it names); a cycle throws. */
function topoOrder(catalogue) {
  const rows = rowsOf(catalogue);
  const rowIds = new Set(idsOf(rows));
  const deps = new Map(rows.map((r) => [r.id, refsOf(r, rowIds).filter((d) => d !== r.id)]));
  const done = new Set();
  const order = [];
  let progress = true;
  while (progress) {
    progress = false;
    for (const r of rows) {
      if (done.has(r.id)) continue;
      if (deps.get(r.id).every((d) => done.has(d))) {
        done.add(r.id);
        order.push(r.id);
        progress = true;
      }
    }
  }
  if (order.length !== rows.length) throw new Error('cycle: catalogue row order is not acyclic');
  return order;
}

/** Deterministic JSON: object keys sorted recursively, arrays keep their order. */
function canonicalJson(x) {
  if (Array.isArray(x)) return `[${x.map(canonicalJson).join(',')}]`;
  if (isObject(x)) {
    const keys = Object.keys(x).sort();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalJson(x[k])}`).join(',')}}`;
  }
  return JSON.stringify(x === undefined ? null : x);
}

function sha256(x) {
  return crypto.createHash('sha256').update(canonicalJson(x), 'utf8').digest('hex');
}

function seedShas(seeds) {
  const s = isObject(seeds) ? seeds : {};
  return {
    catalogue_sha: sha256(s.catalogue ?? null),
    switchboard_sha: sha256(s.switchboard ?? null),
    building_types_sha: sha256(s.buildingTypes ?? s.building_types ?? null),
  };
}

module.exports = {
  SCHEMA,
  validateCatalogue,
  settingDecls,
  settingVals,
  unitsFor,
  topoOrder,
  canonicalJson,
  sha256,
  seedShas,
  duplicateIds,
};

/** One string per catalogue violation; an empty list means the catalogue is valid. */
function validateCatalogue(seeds, increments) {
  const s = isObject(seeds) ? seeds : {};
  const catalogue = isObject(s.catalogue) ? s.catalogue : {};
  const out = [];
  if (catalogue.schema !== SCHEMA) out.push(`schema: expected ${SCHEMA}, got ${catalogue.schema}`);
  const switches = new Set(idsOf(entities(s.switchboard, 'rows')));
  const targets = isObject(s.vocab) && isObject(s.vocab.dsl_target) ? s.vocab.dsl_target : {};
  const U = unitsFor(catalogue, s.vocab);
  const rowIds = new Set(idsOf(rowsOf(catalogue)));
  for (const r of rowsOf(catalogue)) {
    if (!switches.has(r.switch)) out.push(`row ${r.id}: switch ${r.switch} is not in the switchboard`);
    for (const v of revisionsOf(r)) if (!switches.has(v.switch)) out.push(`row ${r.id} revision ${v.increment}: switch ${v.switch} is not in the switchboard`);
  }
  for (const bt of entities(s.buildingTypes, 'rows')) {
    if (!switches.has(bt.switch)) out.push(`building_type ${bt.id}: switch ${bt.switch} is not in the switchboard`);
  }
  out.push(...confidenceViolations(s.switchboard));
  out.push(...nameSpaceViolations(catalogue, targets));
  out.push(...designOptionViolations(catalogue, s.vocab));
  out.push(...rowViolations(catalogue, U, rowIds, increments));
  try {
    topoOrder(catalogue);
  } catch (e) {
    out.push('cycle: catalogue row order is not acyclic');
  }
  return out;
}

/**
 * M-481 (Q-CONF a, amends M-378): every `reading` row carries a confidence from the closed list and a non-empty evidence
 * pointer; a row of another kind carries neither. Fails closed: a missing or unknown value is a violation naming the row.
 */
function confidenceViolations(switchboard) {
  const out = [];
  for (const r of entities(switchboard, 'rows')) {
    const at = `switch ${r.id}: `;
    if (r.kind === 'reading') {
      if (!CONFIDENCE.includes(r.confidence)) out.push(`${at}confidence ${r.confidence} is not one of ${CONFIDENCE.join(', ')}`);
      if (typeof r.evidence !== 'string' || !r.evidence.trim()) out.push(`${at}evidence is empty`);
    } else {
      if (Object.prototype.hasOwnProperty.call(r, 'confidence')) out.push(`${at}confidence is only for a reading row`);
      if (Object.prototype.hasOwnProperty.call(r, 'evidence')) out.push(`${at}evidence is only for a reading row`);
    }
  }
  return out;
}

/**
 * R1 (MB-27; plan-reader-and-mech.md 1.4; M-465, operator "Q-r1 a"): a row's `design_option` names the run it is
 * evaluated in. It must be an object of exactly one key, the key a `vocab.design_options` key and the value one of that
 * key's `values[].option`. With no declared options every tag is a violation (fail closed).
 */
function designOptionViolations(catalogue, vocab) {
  const out = [];
  const declared = isObject(vocab) && isObject(vocab.design_options) ? vocab.design_options : {};
  for (const row of rowsOf(catalogue)) {
    if (!Object.prototype.hasOwnProperty.call(row, 'design_option')) continue;
    const at = `row ${row.id}: `;
    const tag = row.design_option;
    if (!isObject(tag) || Object.keys(tag).length !== 1) {
      out.push(`${at}design_option must be an object of exactly one vocab.design_options key`);
      continue;
    }
    const [key, value] = Object.entries(tag)[0];
    const decl = key !== '$comment' && isObject(declared[key]) ? declared[key] : null;
    if (!decl) {
      out.push(`${at}design_option key ${key} is not a vocab.design_options key`);
      continue;
    }
    const options = toList(decl.values).filter(isObject).map((v) => v.option);
    if (!options.includes(value)) out.push(`${at}design_option ${key} value ${value} is not an option of vocab.design_options.${key}`);
  }
  return out;
}

function nameSpaceViolations(catalogue, targets) {
  const out = [];
  const spaces = [
    ['rows', entities(catalogue, 'rows')],
    ['facts', entities(catalogue, 'facts')],
    ['geometry_inputs', entities(catalogue, 'geometry_inputs')],
    ['lot_flags', entities(catalogue, 'lot_flags')],
  ];
  const all = new Map();
  for (const [name, list] of spaces) {
    for (const id of duplicateIds(list)) out.push(`${name}: duplicate id ${id}`);
    const seen = new Set(idsOf(list));
    for (const id of seen) {
      if (Object.prototype.hasOwnProperty.call(targets, id)) out.push(`${name}: ${id} collides with a layer 2 target`);
      if (all.has(id) && all.get(id) !== name) out.push(`${name}: ${id} collides with ${all.get(id)}`);
      all.set(id, name);
    }
  }
  return out;
}

function rowViolations(catalogue, U, rowIds, increments) {
  const out = [];
  for (const row of rowsOf(catalogue)) {
    const at = `row ${row.id}: `;
    if (!toList(row.clauses).length) out.push(`${at}clauses is empty`);
    if (!toList(row.rules).length) out.push(`${at}rules is empty`);
    if (row.form === 'expr' && typeof row.expression === 'string') out.push(...exprViolations(row, U, at));
    out.push(...refViolations(row, U, at, rowIds));
    if (Array.isArray(increments) && !increments.includes(row.increment)) out.push(`${at}increment ${row.increment} is not a known increment`);
    for (const v of revisionsOf(row)) {
      const rat = `row ${row.id} revision ${v.increment}: `;
      const rev = { ...row, ...v, id: row.id, form: row.form, unit: row.unit };
      if (!toList(v.clauses).length) out.push(`${rat}clauses is empty`);
      if (!toList(v.rules).length) out.push(`${rat}rules is empty`);
      if (typeof v.expression !== 'string') out.push(`${rat}expression is missing`);
      else {
        out.push(...exprViolations(rev, U, rat));
        out.push(...refViolations(rev, U, rat, rowIds));
      }
      if (Array.isArray(increments) && !increments.includes(v.increment)) out.push(`${rat}increment ${v.increment} is not a known increment`);
      if (String(v.increment) === String(row.increment)) out.push(`${rat}a revision must belong to a later increment than its row`);
    }
  }
  for (const fact of entities(catalogue, 'facts')) {
    for (const id of [...toList(fact.bounds_lv), ...toList(fact.needs_l2)]) {
      if (!Object.prototype.hasOwnProperty.call(U.lv, id) && !Object.prototype.hasOwnProperty.call(U.l2, id)) {
        out.push(`fact ${fact.id}: ${id} does not resolve to a setting or a layer 2 target`);
      }
    }
  }
  return out;
}

function exprViolations(row, U, at) {
  const out = [];
  let ast;
  try {
    ast = dsl.parseExpr(row.expression, { layer: 'l3' });
  } catch (e) {
    const code = e && e.code ? e.code : 'unknown';
    return [`${at}parse_error: ${code}`];
  }
  for (const lit of dsl.literalsOf(ast)) {
    if (!LITERALS.includes(lit.value)) out.push(`${at}literal ${lit.value} is not 0, 1 or 2`);
  }
  for (const err of dsl.checkRowL3(row, U)) out.push(`${at}${err}`);
  return out;
}

function refViolations(row, U, at, rowIds) {
  const out = [];
  if (row.form === 'status' || typeof row.expression !== 'string') return out;
  let refs;
  try {
    refs = dsl.l3RefsOf(dsl.parseExpr(row.expression, { layer: 'l3' }));
  } catch (e) {
    return out;
  }
  for (const id of toList(refs.lv)) {
    if (!Object.prototype.hasOwnProperty.call(U.lv, id)) out.push(`${at}lv(${id}) is not a catalogue setting`);
  }
  for (const id of toList(refs.names)) {
    if (!rowIds.has(id) && !Object.prototype.hasOwnProperty.call(U.names, id)) out.push(`${at}${id} resolves to nothing`);
  }
  return out;
}
