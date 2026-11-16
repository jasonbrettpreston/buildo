// SPEC LINK: docs/specs/01-pipeline/69a_mcbylaw_register.md M-72, M-377, M-403, M-415 (MB-27 increment 5, Part B, B5B-2 piece 1: the two-structure read, plan L3-2)
// An add-on building type reads the class's PRINCIPAL cells and its GARDEN-SUITE cells in one l2 map: the principal targets keep their
// own names, each suite target is read under the one declared prefix (building-types.json `suite_read`), so a row can write
// l2(rear_setback_m) for the house and l2(suite_rear_setback_m) for the suite. Pure over parsed seed JSON and the decoded view rows;
// no file, env, clock or database. The module is called by the step (a hashed file: its one call is parked, D-78); the rows runner
// reads the same declaration for the units of the prefixed names.
'use strict';

const cellsLib = require('./layer2-cells.js');

function isObject(x) {
  return !!x && typeof x === 'object' && !Array.isArray(x);
}

function toList(x) {
  return Array.isArray(x) ? x : [];
}

function hasOwn(o, k) {
  return Object.prototype.hasOwnProperty.call(o, k);
}

/** The declaration (`suite_read`) of a building-types seed, or null. */
function declOf(buildingTypes) {
  const d = isObject(buildingTypes) ? buildingTypes.suite_read : null;
  return isObject(d) && typeof d.structure === 'string' && typeof d.prefix === 'string' && d.prefix !== '' ? d : null;
}

/** An add-on type: a building-types row naming the principal type it sits beside (`addon_of`). */
function isAddon(bt) {
  return isObject(bt) && typeof bt.addon_of === 'string';
}

/** One merged map: a key present in both sides is a collision and throws (no cell is silently overwritten). */
function mergeDistinct(base, extra, what) {
  const out = { ...base };
  for (const [k, v] of Object.entries(extra)) {
    if (hasOwn(out, k)) throw new Error('two-structure: ' + what + ' collision on ' + k);
    out[k] = v;
  }
  return out;
}

function prefixed(cells, prefix) {
  const out = {};
  for (const [target, cell] of Object.entries(isObject(cells) ? cells : {})) out[prefix + target] = cell;
  return out;
}

/**
 * The two reads of one add-on type, both through decodeCells / decodeOptionCells (the frozen cell shape, the malformed count and
 * the ROOF-5 words are theirs): the principal structure of the class and the suite structure of the class under the prefix.
 * A target the two structures share (rear_setback_m ...) is two cells under two names; a duplicate inside one structure throws.
 *   l2:        principal cells + prefixed suite cells
 *   l2Options: { runs, shared, flags } with both structures' runs overlaid per option value (the suite options are the runs
 *              suite_low / suite_tall, the roof options the runs of roof_form: an option value belongs to one structure), the
 *              suite option cells under the prefix; `shared` and `flags` merged the same way
 *   malformed: both reads' counts
 */
function decodeAddon(viewCells, viewOptions, bt, opts) {
  const o = opts || {};
  const decl = declOf(o.buildingTypes);
  if (!decl) throw new Error('two-structure: building-types.json has no suite_read declaration');
  if (!isAddon(bt)) throw new Error('two-structure: not an add-on type: ' + String(isObject(bt) ? bt.id : bt));
  const prefix = decl.prefix;
  const house = cellsLib.decodeCells(viewCells, bt.class, 'principal');
  const suite = cellsLib.decodeCells(viewCells, bt.class, decl.structure);
  const houseOpts = cellsLib.decodeOptionCells(viewOptions, bt.class, 'principal', { designOptions: o.designOptions, notAbove: o.notAbove });
  const suiteOpts = cellsLib.decodeOptionCells(viewOptions, bt.class, decl.structure, { designOptions: o.designOptions, notAbove: o.notAbove });
  const runs = {};
  for (const [option, cells] of Object.entries(houseOpts.runs)) runs[option] = { ...cells };
  for (const option of Object.keys(suiteOpts.runs)) if (hasOwn(runs, option)) throw new Error('two-structure: option value in both structures: ' + option);
  for (const [option, cells] of Object.entries(suiteOpts.runs)) runs[option] = prefixed(cells, prefix);
  const flags = {};
  for (const [option, byTarget] of Object.entries(houseOpts.flags)) flags[option] = { ...byTarget };
  for (const [option, byTarget] of Object.entries(suiteOpts.flags)) flags[option] = mergeDistinct(hasOwn(flags, option) ? flags[option] : {}, prefixed(byTarget, prefix), 'flags');
  return {
    l2: mergeDistinct(house.cells, prefixed(suite.cells, prefix), 'l2'),
    l2Options: { runs, shared: mergeDistinct(houseOpts.shared, prefixed(suiteOpts.shared, prefix), 'shared'), flags, malformed: houseOpts.malformed + suiteOpts.malformed },
    malformed: house.malformed + suite.malformed + houseOpts.malformed + suiteOpts.malformed,
    // the suite structure's own count: the principal cells are read (and counted) by the principal type, so the step adds this one only
    malformedSuite: suite.malformed + suiteOpts.malformed,
  };
}

/** vocab.dsl_target units of the prefixed names: { <prefix><target>: unit } (rows.js and catalogue.js read the names' units from here). */
function suiteTargetUnits(buildingTypes, dslTarget) {
  const decl = declOf(buildingTypes);
  const out = {};
  if (!decl) return out;
  const real = isObject(dslTarget) ? dslTarget : {};
  for (const [id, entry] of Object.entries(real)) {
    if (hasOwn(real, decl.prefix + id)) throw new Error('two-structure: prefixed name collides with a layer 2 target: ' + decl.prefix + id);
    out[decl.prefix + id] = isObject(entry) ? entry.unit : entry;
  }
  return out;
}

module.exports = { decodeAddon, suiteTargetUnits, declOf, isAddon, toList };
