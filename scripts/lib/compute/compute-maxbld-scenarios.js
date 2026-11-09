'use strict';
/**
 * compute_maxbld_scenarios — the pure compute (MATERIALIZER of parcel_maxbld_scenarios, migration 287; Layer 3).
 *
 * SPEC LINK: docs/specs/01-pipeline/78_optimal_lot_configuration.md (step identity: the optimal-lot scenario rows)
 * SPEC LINK: docs/specs/01-pipeline/69a_mcbylaw_register.md M-377, M-384, M-415 (the Layer 3 step; the reader discipline; the row seam)
 * MB-31 B10: compute_maxbld_scenarios, a MATERIALIZER of parcel_maxbld_scenarios (migration 287). Pure: the shell's runner reads, this module computes.
 *
 * The runner pages the population, reads the eight declared READ_SQL statements per page (which is why each
 * materialize bind array is not expressible yet: scripts/lib/step/index.js MATERIALIZE_BIND_NAMES = last_key,
 * batch_size, run_at; the ring depth, the radii and the population list are recorded as a gap, never inlined).
 * This module holds no query beyond the declared reads, no transaction, no clock, no literal tunable and no
 * status decision: rows.js owns the seam (M-415), catalogue.js the seed shas, layer2-cells.js the cells,
 * neighbour-facts.js the pooling facts. The zero-write guard is the RUNNER's guarded upsert (declared in the
 * descriptor on content_sha, `guard: is_distinct_from`), never SQL written here.
 */

const rows = require('./maxbld/rows.js');
const cat = require('./maxbld/catalogue.js');
const cellsLib = require('./maxbld/layer2-cells.js');
const factsLib = require('./maxbld/neighbour-facts.js');
// MB-27 R2 (operator "Q-r2 a"): ROOF-5's word is Layer 2's own rule, recomputed on read through its withNotAbove, never re-derived here
const { withNotAbove, traceResult, permissionDisclosuresOf } = require('../bylaw-materialize.js');
const { buildLotVector } = require('../bylaw-resolution.js');
const disclosuresLib = require('./maxbld/disclosures.js');
const DISCLOSURE_FAMILIES = require('./maxbld/disclosure-families.json');
const { runRow, runAllRows } = rows;

/** The eight standalone parameterised reads (contract C5). Bind order: $1 = parcel ids (int[]), $2 = radius / depth (cells, options: $2 = class, $3 = structure). */
const READ_SQL = Object.freeze({
  cells: `SELECT r.parcel_id, r.lot_gate, r.class, r.structure, r.target, r.status, r.value_kind, r.value, r.reason, r.winner_unit_id
  FROM bylaw_resolution_results r
 WHERE r.parcel_id = ANY($1::int[]) AND r.class = $2 AND r.structure = $3
 ORDER BY r.parcel_id, r.target`,
  // MB-27 R2 (M-400, M-465; plan-reader-and-mech.md 1.4 R2 (1)): the design-option slots and the threshold (option NULL), migration 295
  options: `SELECT o.parcel_id, o.lot_gate, o.class, o.structure, o.target, o.option, o.status, o.value_kind, o.value, o.reason, o.winner_unit_id
  FROM bylaw_resolution_option_results o
 WHERE o.parcel_id = ANY($1::int[]) AND o.class = $2 AND o.structure = $3
 ORDER BY o.parcel_id, o.target, o.option`,
  // Q-STOR a (migration 295): the lot stamps are stored as bytea; Layer 3 reads them as hex through the view bylaw_resolution_lot_stamps
  lots: `SELECT l.parcel_id, l.lot_gate, l.permitted, l.permitted_text_ids, l.table_version, l.evaluator_version
  FROM bylaw_resolution_lot_stamps l
 WHERE l.parcel_id = ANY($1::int[])`,
  // MB-27 increment 3, DL-21 a (D-8 read wiring): the parcels columns resolve_bylaws reads (resolve-bylaws.js buildSourceSql), so buildLotVector can rebuild the lot vector
  parcel: `SELECT p.id, p.parcel_id, p.zoning_class, p.zoning_zn_string, p.exception_number, p.zoning_overlays, p.on_policy_road, p.is_corner_lot,
       p.is_through_lot, p.abuts_laneway, p.frontage_m, p.depth_m, p.lot_size_sqm, p.zoning_is_ambiguous, p.in_sixplex_area, p.is_heritage_designated,
       ST_NPoints(p.geom)::int AS geom_npoints
  FROM parcels p
 WHERE p.id = ANY($1::int[])`,
  geometry: `SELECT p.id, p.lot_size_sqm, p.frontage_m, p.depth_m, p.is_corner_lot, p.zoning_class, p.primary_frontage_street_name
  FROM parcels p
 WHERE p.id = ANY($1::int[])`,
  abutters: `SELECT a.parcel_id, a.neighbour_id, a.shared_len_m::double precision AS shared_len_m, a.front_setback_est_m::double precision AS est, a.est_status, a.bldg_to_subject_m::double precision AS bldg_m, a.same_frontage_street AS same_street, a.neighbour_residential AS residential
  FROM parcel_abutments a
 WHERE a.parcel_id = ANY($1::int[])`,
  street_pool: `SELECT p.id, a.front_setback_est_m AS est
  FROM parcels p
  LEFT JOIN parcel_abutments a ON a.parcel_id = p.id
  JOIN parcels s ON s.id = ANY($1::int[]) AND s.primary_frontage_street_name = p.primary_frontage_street_name
 WHERE ST_DWithin(p.geom, s.geom, $2::double precision)
   AND p.id <> ALL($1::int[])
   AND NOT EXISTS (SELECT 1 FROM parcel_abutments x WHERE x.parcel_id = s.id AND x.neighbour_id = p.id)
 ORDER BY p.id`,
  zone_pool: `SELECT p.id, a.front_setback_est_m AS est
  FROM parcels p
  LEFT JOIN parcel_abutments a ON a.parcel_id = p.id
  JOIN parcels s ON s.id = ANY($1::int[]) AND s.zoning_class = p.zoning_class
 WHERE ST_DWithin(p.geom, s.geom, $2::double precision)
   AND p.id <> ALL($1::int[])
   AND NOT EXISTS (SELECT 1 FROM parcel_abutments x WHERE x.parcel_id = s.id AND x.neighbour_id = p.id)
 ORDER BY p.id`,
  ring_lots: `WITH RECURSIVE chain AS (
  SELECT 0 AS level, s.id AS lot_id, NULL::double precision AS shared_len_m
    FROM parcels s
   WHERE s.id = ANY($1::int[])
  UNION ALL
  SELECT c.level + 1, nxt.lot_id, nxt.shared_len_m
    FROM chain c
    JOIN LATERAL (
      SELECT a.neighbour_id AS lot_id, a.shared_len_m
        FROM parcel_abutments a
        JOIN parcels p ON p.id = a.neighbour_id
        JOIN parcels subj ON subj.id = ANY($1::int[])
       WHERE a.parcel_id = c.lot_id
         AND p.primary_frontage_street_name = subj.primary_frontage_street_name
         AND c.level < $2::int
         AND NOT a.neighbour_id = ANY($1::int[])
         AND NOT EXISTS (SELECT 1 FROM chain done WHERE done.lot_id = a.neighbour_id)
         AND NOT EXISTS (SELECT 1 FROM parcel_abutments x WHERE x.parcel_id = ANY($1::int[]) AND x.neighbour_id = a.neighbour_id)
       ORDER BY a.shared_len_m DESC, a.neighbour_id ASC
       LIMIT 1) nxt ON true
)
SELECT c.level, c.lot_id, c.shared_len_m, a.front_setback_est_m AS est
  FROM chain c
  LEFT JOIN parcel_abutments a ON a.parcel_id = c.lot_id
 WHERE c.level > 0
 ORDER BY c.level, c.lot_id`,
});

function toList(x) {
  return Array.isArray(x) ? x : [];
}

function sorted(list) {
  return [...new Set(toList(list))].sort();
}

function findById(list, id) {
  return toList(list).find((x) => x && typeof x === 'object' && x.id === id) || null;
}

function shas(seeds, meta) {
  const m = meta || {};
  return {
    settings_sha: m.settings_sha ?? null,
    layer2_table_version: m.layer2_table_version ?? null,
    ...cat.seedShas(seeds),
  };
}

/** The hashed content: never the wall clock, never key order, never flag order. */
function contentOf(row) {
  const r = row || {};
  return {
    status: r.status ?? null,
    value: r.value ?? null,
    reason: r.reason ?? null,
    flags: sorted(r.flags),
    trace: toList(r.trace),
    switches: toList(r.switches),
    catalogue_sha: r.catalogue_sha ?? null,
    switchboard_sha: r.switchboard_sha ?? null,
    settings_sha: r.settings_sha ?? null,
    layer2_table_version: r.layer2_table_version ?? null,
    increment: r.increment ?? null,
    building_types_sha: r.building_types_sha ?? null,
  };
}

/** sha256 hex of the canonical JSON of the row's content (E31-13). */
function contentSha(row) {
  return cat.sha256(contentOf(row));
}

/** One catalogue result -> the parcel_maxbld_scenarios row. */
function dbRow(parcelId, buildingType, increment, result, s) {
  const row = {
    parcel_id: parcelId,
    building_type: buildingType,
    field_id: result.row,
    increment,
    status: result.status,
    value: result.value,
    unit: result.unit,
    reason: result.reason,
    flags: sorted(result.flags),
    trace: toList(result.trace),
    switches: toList(result.switches),
    catalogue_sha: s.catalogue_sha,
    switchboard_sha: s.switchboard_sha,
    settings_sha: s.settings_sha,
    layer2_table_version: s.layer2_table_version,
  };
  row.content_sha = contentSha({ ...row, building_types_sha: s.building_types_sha });
  return row;
}

/**
 * E31-14: the rows of one parcel, one per result of every building type of the seed list, in a stable order.
 * @param {{parcel_id: number, l2: object, perm: object, geometry: object, flags: object, neighbours: object, settings?: object}} parcelInput
 * @param {object} seeds the parsed seed JSON (C5 shape)
 * @param {{settings_sha?: string, layer2_table_version?: string}} meta
 */
function buildParcelRows(parcelInput, seeds, meta) {
  const p = parcelInput || {};
  const inputs = {
    seeds,
    l2: p.l2 || {},
    l2Options: p.l2Options || {},
    l2Flags: p.l2Flags || {},
    permFlags: p.permFlags || [],
    perm: p.perm || {},
    geometry: p.geometry || {},
    flags: p.flags || {},
    neighbours: p.neighbours || {},
    settings: p.settings || {},
  };
  const s = shas(seeds, meta);
  const out = [];
  for (const bt of toList(seeds && seeds.buildingTypes && seeds.buildingTypes.rows)) {
    const results = runAllRows({ ...inputs, buildingType: bt.id });
    for (const result of results) out.push(dbRow(p.parcel_id, bt.id, bt.increment, result, s));
  }
  return out;
}

/**
 * RV-2: the census of a list of emitted rows — the three counts `oneParcel` has always summed, plus the closure
 * violations (a trace entry naming a variable / target / geometry / fact the catalogue does not declare) and the
 * flags-missing count (a not_applicable / not_evaluated row with neither a flag nor a reason).
 */
function censusOf(rows, U) {
  const u = U || {};
  const lvKeys = u.lv || {};
  const nameKeys = u.names || {};
  const counts = { status_outside_closed_set: 0, numbers_without_trace: 0, not_buildable_with_value: 0, closure_violations: 0, flags_missing: 0 };
  for (const r of toList(rows)) {
    const row = r || {};
    if (!CLOSED_STATUSES.includes(row.status)) counts.status_outside_closed_set += 1;
    if (typeof row.value === 'number' && toList(row.trace).length === 0) counts.numbers_without_trace += 1;
    if (row.status === 'not_buildable' && row.value !== null && row.value !== undefined) counts.not_buildable_with_value += 1;
    const unresolved = toList(row.trace).some((entry) => {
      const e = entry || {};
      const id = e.id;
      if (e.kind === 'lv') return !Object.prototype.hasOwnProperty.call(lvKeys, id);
      if (e.kind === 'row' || e.kind === 'fact' || e.kind === 'geometry') return !Object.prototype.hasOwnProperty.call(nameKeys, id);
      return false;
    });
    if (unresolved) counts.closure_violations += 1;
    if (row.status === 'not_applicable' || row.status === 'not_evaluated') {
      const noFlags = toList(row.flags).length === 0;
      const noReason = row.reason === null || row.reason === undefined || row.reason === '';
      if (noFlags && noReason) counts.flags_missing += 1;
    }
  }
  return counts;
}

const stamp8 = (x) => String(x || '').slice(0, 8);

/**
 * MB-27 D-8 (R3-02 dated note 2026-11-06; D-6 a, guard (i)): the closed disclosure words of one parcel and one building type.
 * Recomputed on read by Layer 2's own functions (traceResult per read target, permissionDisclosuresOf), only when the stored
 * stamp is this tree's Layer 1 input (`lookups.layer1Env` versions) and the parcels row is at hand; otherwise every read
 * target carries the closed stale word and nothing is recomputed (fail closed, never silence). A gated lot discloses nothing.
 */
function disclosureWords(source, bt, targets, L) {
  const lot = source.lot || {};
  if (lot.lot_gate !== null && lot.lot_gate !== undefined) return { l2Flags: {}, permFlags: [] };
  const env = L.layer1Env;
  const current = Boolean(env && source.parcel && env.versions
    && stamp8(lot.table_version) === stamp8(env.versions.table_version) && stamp8(lot.evaluator_version) === stamp8(env.versions.evaluator_version));
  if (!current) return disclosuresLib.carriedWords({ targets, stale: true }, DISCLOSURE_FAMILIES);
  const { lot: vector } = buildLotVector(source.parcel, env.lotEnv);
  const base = {};
  for (const t of targets) base[t] = traceResult(vector, bt.structure, t, bt.class, env).disclosures;
  if (!source.permitted_by_class) throw new Error(`disclosureWords: parcel ${source.parcel_id} has no stored permission words`);
  const permission = permissionDisclosuresOf(source.parcel, lot, source.permitted_by_class, env)[bt.class];
  return disclosuresLib.carriedWords({ targets, base, permission }, DISCLOSURE_FAMILIES);
}

/** One source row (parcel + its eight reads; `options` from MB-27 R2) -> the parcel rows plus the census the checks read. */
function oneParcel(source, lookups) {
  const L = lookups || {};
  const l2Classes = toList(L.layer2Classes);
  const decoded = {};
  const options = {};
  let unparseable = 0;
  const designOptions = L.vocab && L.vocab.design_options;
  for (const bt of toList(L.seeds && L.seeds.buildingTypes && L.seeds.buildingTypes.rows)) {
    const d = cellsLib.decodeCells(toList(source.cells), bt.class, bt.structure);
    decoded[bt.id] = d.cells;
    unparseable += d.malformed;
    const o = cellsLib.decodeOptionCells(toList(source.options), bt.class, bt.structure, { designOptions, notAbove: withNotAbove });
    options[bt.id] = o;
    unparseable += o.malformed;
  }
  const meta = { settings_sha: L.settings_sha ?? null, layer2_table_version: source.lot ? source.lot.table_version : null };
  const out = [];
  const census = { layer2_cell_unparseable: unparseable, status_outside_closed_set: 0, numbers_without_trace: 0, not_buildable_with_value: 0, closure_violations: 0, flags_missing: 0 };
  const U = cat.unitsFor(L.seeds && L.seeds.catalogue, L.vocab);
  for (const bt of toList(L.seeds && L.seeds.buildingTypes && L.seeds.buildingTypes.rows)) {
    const perm = l2Classes.includes(bt.class)
      ? cellsLib.decodePermission(source.lot || {}, bt.class, { classes: l2Classes, permissionKeys: L.permissionKeys, texts: L.texts })
      : {};
    const g = source.geometry || {};
    const words = l2Classes.includes(bt.class) ? disclosureWords(source, bt, Object.keys(decoded[bt.id]), L) : { l2Flags: {}, permFlags: [] };
    const parcelInput = {
      parcel_id: source.parcel_id,
      l2: decoded[bt.id],
      l2Options: options[bt.id],
      l2Flags: words.l2Flags,
      permFlags: words.permFlags,
      perm,
      geometry: {
        lot_frontage_m: g.frontage_m,
        lot_depth_m: g.depth_m,
        lot_area_m2: g.lot_size_sqm,
        is_corner_lot: g.is_corner_lot,
      },
      flags: { corner_lot: g.is_corner_lot === true },
      neighbours: factsLib.neighbourFacts(
        { neighbours: toList(source.abutters), street: toList(source.street), zone: toList(source.zone), ring: toList(source.ring) },
        decoded[bt.id].averaging_distance_m || { s: 'not_evaluated', kind: null, value: null, clause: null, reason: null },
      ).facts,
    };
    for (const r of buildParcelRows(parcelInput, L.seeds, meta)) out.push(r);
  }
  const counted = censusOf(out, U);
  for (const k of ['status_outside_closed_set', 'numbers_without_trace', 'not_buildable_with_value', 'closure_violations', 'flags_missing']) census[k] = counted[k];
  return { rows: out, census };
}

/**
 * The rows arm (R-EH): one source row per parcel -> every parcel_maxbld_scenarios row of that parcel. Pure.
 * @param {object[]} sourceRows
 * @param {{config?: object, lookups: object}} ctx
 */
function materializeRows(sourceRows, ctx) {
  const lookups = (ctx && ctx.lookups) || {};
  const e1 = [];
  const matched = { parcels: 0, rows_emitted: 0, layer2_cell_unparseable: 0, status_outside_closed_set: 0, numbers_without_trace: 0, not_buildable_with_value: 0, closure_violations: 0, flags_missing: 0 };
  for (const source of toList(sourceRows)) {
    const one = oneParcel(source, lookups);
    e1.push(...one.rows);
    matched.parcels += 1;
    matched.rows_emitted += one.rows.length;
    for (const k of ['layer2_cell_unparseable', 'status_outside_closed_set', 'numbers_without_trace', 'not_buildable_with_value', 'closure_violations', 'flags_missing']) matched[k] += one.census[k];
  }
  return { rows: { e1 }, matched };
}

/** The closed scenario status set of the seam (rows.js + the permission statuses). */
const CLOSED_STATUSES = Object.freeze([
  'computed',
  'unlimited',
  'unregulated',
  'not_applicable',
  'not_buildable',
  'not_evaluated',
  'permitted',
  'not_permitted',
  'not_modelled',
]);

// ---- checks: every bound is a count the materializer summed; no comparison lives here (G7). ----

function count(ctx, id) {
  ctx.report(id, { violations: (ctx.matched && ctx.matched[id]) || 0 });
}
function rows_written(ctx) { ctx.report('rows_written', { value: (ctx.matched && ctx.matched.rows_emitted) || 0 }); }
function closure_violations(ctx) { count(ctx, 'closure_violations'); }
function status_outside_closed_set(ctx) { count(ctx, 'status_outside_closed_set'); }
function numbers_without_trace(ctx) { count(ctx, 'numbers_without_trace'); }
function flags_missing(ctx) { count(ctx, 'flags_missing'); }
function not_buildable_with_value(ctx) { count(ctx, 'not_buildable_with_value'); }
function layer2_cell_unparseable(ctx) { count(ctx, 'layer2_cell_unparseable'); }

const CHECKS = {
  rows_written,
  closure_violations,
  status_outside_closed_set,
  numbers_without_trace,
  flags_missing,
  not_buildable_with_value,
  layer2_cell_unparseable,
};

/** The runner's check loop is the error boundary; the emits are copied from `ctx.matched`. */
async function compute(ctx) {
  for (const id of ctx.checks) {
    const check = CHECKS[id];
    if (typeof check !== 'function') throw new Error(`[${ctx.descriptor.identity.name}] descriptor declares check "${id}" with no function in the compute dispatch table`);
    try {
      await check(ctx);
    } catch (err) {
      ctx.log.error(`[${ctx.descriptor.identity.name}]`, `FAIL: ${id} — ${err.message}`);
      ctx.report(id, { error: err });
    }
  }
  if (!ctx.matched) return { records_meta: {} };
  const meta = {};
  for (const e of ctx.descriptor.emits || []) if (ctx.matched[e.key] !== undefined) meta[e.key] = ctx.matched[e.key];
  return { records_meta: meta };
}

/** The population setting is a list of decimal strings (the step library validates a list as members of a closed list_of of strings); the step binds integers. */
function populationIds(ids) {
  return toList(ids).map((id) => Number(id)).filter((n) => Number.isInteger(n));
}

module.exports = compute;
module.exports.compute = compute;
module.exports.runRow = runRow;
module.exports.buildParcelRows = buildParcelRows;
module.exports.contentSha = contentSha;
module.exports.censusOf = censusOf;
module.exports.materializeRows = materializeRows;
module.exports.READ_SQL = READ_SQL;
module.exports.CHECKS = CHECKS;
/** Spec 122 §5.5 (1): the dispatch table under the name the conformance battery reads (descriptor order). */
module.exports.checks = CHECKS;
module.exports.CLOSED_STATUSES = CLOSED_STATUSES;
module.exports.populationIds = populationIds;
module.exports.disclosureWords = disclosureWords;
