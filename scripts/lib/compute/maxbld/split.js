// SPEC LINK: docs/specs/01-pipeline/69a_mcbylaw_register.md M-403, M-390, M-415 (dated notes 2026-11-13);
//            docs/specs/01-pipeline/78_optimal_lot_configuration.md P5.10
//
// MB-27 increment 5 (Part B, B5B-3): the split of the garden-suite add-on, declared in data (building-types.json `split`).
// Pure functions over the parsed seeds. For one add-on type, every arm x coverage path x allocation, every CANDIDATE depth is
// evaluated through the M-415 seam (rows.js `inputs.rows`) over the catalogue rows: the depth, then the allocation's footprint,
// are injected and the main GFA and the suite GFA are READ from their rows. A candidate depth is one of three declared kinds,
// never a search (M-403 "no search helper"): `range_end`, `row` (a catalogue row whose value is a depth) and `crossing` (the depth
// where two rows meet, solved on the straight line of each interval between the other candidates). No id, zone, clause or
// number lives here: the rows, settings and words are all `split` declarations.
'use strict';

const rows = require('./rows.js');
const catalogueLib = require('./catalogue.js');

const { round9 } = rows;
const toList = (x) => (Array.isArray(x) ? x : []);
const isObject = (x) => !!x && typeof x === 'object' && !Array.isArray(x);
const num = (res) => (res && res.status === 'computed' && typeof res.value === 'number' ? res.value : null);

/** The arms: the option values of the declared design option, in declaration order (vocab.design_options). */
function armsOf(decl, seeds) {
  const o = seeds && seeds.vocab && seeds.vocab.design_options && seeds.vocab.design_options[decl.arm_design_option];
  return toList(o && o.values).map((v) => v.option);
}

function settingOf(seeds, id) {
  const v = catalogueLib.settingVals(seeds.catalogue, seeds.logicVariables)[id];
  return v ? v.value : null;
}

/** FD-3 a (ANSWER-KEY.md:48): the larger total; equal total, path B; then the larger main GFA; then the larger main footprint. */
function better(c, b, tiePath) {
  if (round9(c.total) !== round9(b.total)) return round9(c.total) > round9(b.total);
  if (c.path !== b.path) return c.path === tiePath;
  if (round9(c.main) !== round9(b.main)) return round9(c.main) > round9(b.main);
  return round9(c.mainFootprint) > round9(b.mainFootprint);
}

/** One candidate depth in one context: the footprint, the main and the suite as the rows give them (null when a row is not computed). */
function evaluate(base, decl, ctx, d, extra) {
  const withDepth = { ...base, rows: { ...(base.rows || {}), [decl.depth_inject]: { value: d } } };
  const f = num(rows.runRowsIn([ctx.alloc.footprint_row], ctx.arm, withDepth)[ctx.alloc.footprint_row]);
  if (f === null || !(f > 0)) return null;
  const withFootprint = { ...withDepth, rows: { ...withDepth.rows, [decl.footprint_inject]: { value: f } } };
  const ids = [decl.main_gfa_row, decl.width_row, decl.storeys_row, ctx.path.suite_gfa_row, ctx.path.suite_footprint_row, ...extra];
  const got = rows.runRowsIn([...new Set(ids)], ctx.arm, withFootprint);
  return { d, f, got };
}

/** The candidate to score from an evaluation, or null when a minimum, a refusal or a not-buildable row rules it out. */
function candidateOf(ev, decl, ctx, widthMin) {
  if (!ev) return null;
  const main = num(ev.got[decl.main_gfa_row]);
  const suite = num(ev.got[ctx.path.suite_gfa_row]);
  const width = num(ev.got[decl.width_row]);
  if (main === null || suite === null || width === null) return null;
  if (round9(width) < round9(widthMin)) return null; // the house is as wide as the minimum dimension
  const st = num(ev.got[decl.storeys_row]);
  return {
    arm: ctx.arm, path: ctx.path.id, allocation: ctx.alloc.id, d: ev.d, mainFootprint: ev.f, main, suite,
    suiteFootprint: num(ev.got[ctx.path.suite_footprint_row]), storeys: st, total: main + suite,
  };
}

/** The gap a - b of one crossing at depth d (null when a row does not compute). */
function gapAt(base, decl, ctx, d, extra, c) {
  const ev = evaluate(base, decl, ctx, d, extra);
  if (!ev) return null;
  const a = num(ev.got[c.a]);
  const b = num(ev.got[c.b]);
  return a === null || b === null ? null : a - b;
}

/** A root bracketed by two gaps of opposite sign, by fixed regula falsi steps (the bracket always keeps the sign change). */
function refineRoot(gap, x0, g0, x1, g1, steps) {
  let a = x0; let ga = g0; let b = x1; let gb = g1;
  let x = a - (ga * (b - a)) / (gb - ga);
  for (let i = 0; i < steps; i += 1) {
    x = a - (ga * (b - a)) / (gb - ga);
    const gx = gap(x);
    if (gx === null || gx === 0) break;
    if (gx * ga < 0) { b = x; gb = gx; } else { a = x; ga = gx; }
  }
  return x;
}

/** Every candidate depth of one context, ascending, unique at 9 places, inside the range. */
function candidateDepths(base, decl, ctx, lo, hi) {
  const found = new Map();
  const add = (d) => {
    if (typeof d !== 'number' || !Number.isFinite(d)) return;
    if (round9(d) < round9(lo) || round9(d) > round9(hi)) return;
    found.set(round9(d), d);
  };
  const declared = [...toList(decl.common_candidates), ...toList(ctx.path.candidates)];
  for (const c of declared) {
    if (c.kind === 'range_end') add(c.end === 'min' ? lo : hi);
    else if (c.kind === 'row') {
      // a row's depth is rounded at 9 places by the evaluator (env.round9): the kink itself may sit just on the refused side of a minimum, so its two neighbours at the declared nudge are candidates too
      const v = num(rows.runRowsIn([c.row], ctx.arm, base)[c.row]);
      if (v !== null) for (const k of [0, -1, 1]) add(v + k * decl.row_nudge_m);
    }
  }
  // crossings: on each interval between the candidates so far, both rows are straight lines: the root is exact
  const pts = [...found.keys()].sort((a, b) => a - b);
  const crossings = declared.filter((c) => c.kind === 'crossing');
  if (crossings.length) {
    const extra = [...new Set(crossings.flatMap((c) => [c.a, c.b]))];
    for (let i = 0; i + 1 < pts.length; i += 1) {
      const x0 = pts[i];
      const x1 = pts[i + 1];
      if (!(x1 - x0 > 1e-9)) continue;
      const e = (x1 - x0) * 1e-7;
      const g = [x0 + e, x1 - e].map((d) => evaluate(base, decl, ctx, d, extra));
      if (!g[0] || !g[1]) continue;
      for (const c of crossings) {
        const diff = g.map((ev) => {
          const a = num(ev.got[c.a]);
          const b = num(ev.got[c.b]);
          return a === null || b === null ? null : a - b;
        });
        if (diff[0] === null || diff[1] === null || diff[0] === diff[1] || diff[0] * diff[1] > 0) continue;
        const p0 = x0 + e;
        const p1 = x1 - e;
        // the root sits on the edge of a minimum (suite 25, house 60) the same way a row's kink does: its two neighbours at the declared nudge are candidates too
        let root = p0 + ((p1 - p0) * diff[0]) / (diff[0] - diff[1]);
        // D-65: a crossing that declares refine_steps meets where at least one row is curved (a pitched roof's attic floor): the straight-line root is only the first estimate, so it is refined by that many secant steps on the bracket, each read through the same rows
        if (Number.isInteger(c.refine_steps) && c.refine_steps > 0) root = refineRoot((x) => gapAt(base, decl, ctx, x, extra, c), p0, diff[0], p1, diff[1], c.refine_steps);
        for (const k of [0, -1, 1]) add(root + k * decl.row_nudge_m);
      }
    }
  }
  return [...found.keys()].sort((a, b) => a - b);
}

/**
 * The split of one add-on type's lot: the best candidate over every arm, path and allocation (FD-3 a), with the best of each
 * arm x path (the key's `options`). `inputs` is the add-on type's runner input (seeds, l2 with the suite cells under their prefix,
 * geometry, flags ...), `buildingType` the add-on type id.
 * @returns {{best: object|null, options: Object<string, object>, evaluated: number, range: {lo: number, hi: number}|null, suiteWidth: number|null}}
 */
function chooseSplit(inputs, decl, seeds) {
  const out = { best: null, options: {}, evaluated: 0, range: null, suiteWidth: null };
  const widthMin = settingOf(seeds, decl.width_min_setting);
  const lo = settingOf(seeds, decl.range.min_setting);
  const hiRes = rows.runRowsIn([decl.range.max_row], 'base', inputs)[decl.range.max_row];
  const hi = num(hiRes);
  if (hi === null || lo === null || !(hi >= lo)) return out;
  out.range = { lo, hi };
  for (const arm of armsOf(decl, seeds)) {
    out.suiteWidth = num(rows.runRowsIn([decl.suite_width_row], arm, inputs)[decl.suite_width_row]);
    for (const path of toList(decl.paths)) {
      let bestOfOption = null;
      for (const alloc of toList(path.allocations)) {
        const ctx = { arm, path, alloc };
        for (const d of candidateDepths(inputs, decl, ctx, lo, hi)) {
          out.evaluated += 1;
          const c = candidateOf(evaluate(inputs, decl, ctx, d, []), decl, ctx, widthMin);
          if (c && (!bestOfOption || better(c, bestOfOption, decl.tie_path))) bestOfOption = c;
        }
      }
      if (bestOfOption) {
        out.options[`${arm}/${path.id}`] = bestOfOption;
        if (!out.best || better(bestOfOption, out.best, decl.tie_path)) out.best = bestOfOption;
      }
    }
  }
  return out;
}

module.exports = { chooseSplit, better, armsOf, evaluate, candidateOf, candidateDepths };

/** The word of what bound the suite GFA of a chosen candidate (the key's suite_binds), read from the rows named in `outputs`. */
function bindingOf(ev, c, decl, seeds) {
  const o = decl.outputs;
  const margin = settingOf(seeds, decl.margin_setting);
  const x = (id) => num(ev.got[id]);
  const cap = x(o.cap_row) === null ? null : x(o.cap_row) - margin;
  const st = c.storeys;
  const fromFootprint = st * c.suiteFootprint;
  if (c.suite < Math.min(fromFootprint, cap === null ? Infinity : cap) - decl.tie_tolerance_m2) return 'suite_gfa_lt_main';
  if (cap !== null && cap <= fromFootprint + decl.tie_tolerance_m2) return 'suite_gfa_cap'; // a tie with the cap is the cap (the key checks the cap after the region)
  const region = x(o.region_row);
  const anc = x(o.ancillary_row) === null ? null : (x(o.ancillary_row) - margin);
  if (c.path === decl.tie_path && anc !== null && region !== null && anc < st * region - decl.tie_tolerance_m2) return 'ancillary_coverage'; // strictly smaller than the region (the key)
  if (c.path === 'A' && region !== null && round9(st * region) > round9(fromFootprint)) return 'lot_coverage';
  return 'suite_region';
}

/**
 * The stored output rows of one parcel: for each add-on type, the split's chosen candidate (P5.10): the suite GFA and footprint, the
 * house depth chosen, the house GFA with and without the suite and the total gain. Each is a plain result ({row, status, value, unit,
 * reason, flags, trace, switches}) for the step's dbRow. AR-6 (b): a total at or below the row alone carries the lower-option word
 * (the headline stays the row alone, which is the `main_gfa_without_suite_sqm` row).
 * @param {Object<string, {input: object, rows: object[]}>} perType
 * @param {object} seeds
 * @returns {{building_type: string, increment: string, result: object}[]}
 */
function splitResults(perType, seeds) {
  const decl = seeds && seeds.buildingTypes && seeds.buildingTypes.split;
  if (!isObject(decl)) return [];
  const out = [];
  const o = decl.outputs;
  for (const bt of toList(seeds.buildingTypes.rows)) {
    if (!bt || typeof bt.addon_of !== 'string') continue;
    const mine = perType[bt.id];
    const base = perType[bt.addon_of];
    if (!mine || !base) continue;
    const baseRows = new Map(toList(base.rows).map((r) => [r.field_id, r]));
    const perm = baseRows.get(decl.alone.permission_row);
    const alone = baseRows.get(decl.alone.gfa_row);
    const emit = (spec, status, value, reason, flags, trace) => out.push({ building_type: bt.id, increment: bt.increment, result: { row: spec.id, status, value, unit: spec.unit, reason, flags, trace, switches: [] } });
    const fields = [o.suite_gfa, o.suite_footprint, o.depth, o.main_with, o.main_without, o.gain];
    const refuse = (reason, flags) => { for (const f of fields) emit(f, 'not_evaluated', null, reason, flags, []); };
    if (!perm || perm.status !== 'permitted') { refuse((perm && (perm.reason || perm.status)) || 'missing_input:permitted', []); continue; }
    if (!alone || alone.status !== 'computed' || typeof alone.value !== 'number') { refuse((alone && (alone.reason || alone.status)) || 'missing_input:absent_target', []); continue; }
    const inputs = { seeds, ...mine.input, buildingType: bt.id, settings: mine.input.settings || {} };
    // P3 (a), AR-2 (d): a declared gate row that does not compute (an exception unit cap of one or two) refuses every output with its own reason (fail closed)
    const gateIds = toList(decl.gate_rows);
    const gates = gateIds.length ? rows.runRowsIn(gateIds, 'base', inputs) : {};
    const shut = gateIds.map((id) => gates[id]).find((g) => !g || g.status !== 'computed');
    if (shut !== undefined) { refuse(shut.reason || shut.status || 'missing_input:gate', []); continue; }
    const r = chooseSplit(inputs, decl, seeds);
    if (!r.best) {
      const widthMin = settingOf(seeds, decl.width_min_setting);
      const narrow = r.suiteWidth !== null && round9(r.suiteWidth) < round9(widthMin);
      refuse(narrow ? decl.no_room_reasons.width : decl.no_room_reasons.area, []);
      continue;
    }
    const c = r.best;
    const path = toList(decl.paths).find((p) => p.id === c.path);
    const ctx = { arm: c.arm, path, alloc: toList(path.allocations).find((a) => a.id === c.allocation) };
    const ev = evaluate(inputs, decl, ctx, c.d, [o.cap_row, o.ancillary_row, o.region_row]);
    const lower = !(round9(c.total) > round9(alone.value));
    const flags = [o.arm_words[c.arm], o.path_words[c.path], o.binding_words[bindingOf(ev, c, decl, seeds)]];
    if (c.path === 'A' && round9(c.main) > round9(alone.value)) flags.push(o.coverage_path_a_word);
    if (lower) flags.push(o.lower_option_word);
    const trace = [{ kind: 'row', id: decl.main_gfa_row }, { kind: 'row', id: path.suite_gfa_row }];
    emit(o.suite_gfa, 'computed', c.suite, null, [...flags].sort(), trace);
    emit(o.suite_footprint, 'computed', c.suite / c.storeys, null, [], trace);
    emit(o.depth, 'computed', c.d, null, [], trace);
    emit(o.main_with, 'computed', c.main, null, [], trace);
    emit(o.main_without, 'computed', alone.value, null, [], [{ kind: 'row', id: decl.alone.gfa_row }]);
    emit(o.gain, 'computed', c.total - alone.value, null, lower ? [o.lower_option_word] : [], trace);
  }
  return out;
}

module.exports.splitResults = splitResults;
module.exports.bindingOf = bindingOf;
