'use strict';
/**
 * compute_maxbld_scenarios — the pure compute (MATERIALIZER of parcel_maxbld_scenarios, migration 309 (the 287 draft); Layer 3).
 *
 * SPEC LINK: docs/specs/01-pipeline/78_optimal_lot_configuration.md (step identity: the optimal-lot scenario rows)
 * SPEC LINK: docs/specs/01-pipeline/69a_mcbylaw_register.md M-377, M-384, M-415 (the Layer 3 step; the reader discipline; the row seam)
 * MB-31 B10: compute_maxbld_scenarios, a MATERIALIZER of parcel_maxbld_scenarios (migration 309). Pure: the shell's runner reads, this module computes.
 *
 * The runner pages the population with ONE batch statement (buildSourceSql) that carries the eight declared READ_SQL reads per
 * page lot. The runner binds its keyset values ($1, $2); the declared settings the reads need (the population ids, the radii, the bbox
 * divisor) are validated ctx.config values written into the statement as checked literals ($3-$6 below; operator "option 2" 2026-11-11,
 * STOP-11: the R-EH (a) runner bind waits the next fleet recapture night; the enrich-parcels / enrich-centreline precedent). The ring depth is applied here, in the walk (MB-31 plan section 22). The runtime loader
 * (D8-SHELL) assembles the lookups once per run from the runner's lookup rows, the seed files and the validated ctx.config.
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
const { withNotAbove, traceResult, permissionDisclosuresOf, makeEnv } = require('../bylaw-materialize.js');
const { buildLotVector } = require('../bylaw-resolution.js');
const disclosuresLib = require('./maxbld/disclosures.js');
const DISCLOSURE_FAMILIES = require('./maxbld/disclosure-families.json');
const { runRow, runAllRows } = rows;
const lr = require('../bylaw-lot-row.js');
// D8-SHELL: the seed files and the generated Layer 1 input, read once at load (the resolve-bylaws.js precedent; declared in staleness.fingerprint_inputs)
const CATALOGUE = require('../../seeds/bylaw/layer3-catalogue.json');
const SWITCHBOARD = require('../../seeds/bylaw/switchboard.json');
const BUILDING_TYPES = require('../../seeds/bylaw/building-types.json');
const VOCAB = require('../../seeds/bylaw/vocab.json');
const SCOPE = require('../../seeds/bylaw/layer2-scope.json');
const MAP = require('../../seeds/bylaw/layer2-map.json');
const LV_SEED = require('../../seeds/logic_variables.json');
const INPUT = require('../../../docs/reference/bylaw-layer2-input.json');
/** The stored resolve_bylaws population (its zone list), read from the declared logic_variables lookup for the Layer 1 env only. */
const LAYER2_ZONE_LIST = 'resolve_bylaws_population_zone_classes';

/**
 * The eight declared reads (contract C5), each a statement correlated to the subject lot `s` of ONE batch statement (buildSourceSql,
 * the runner binds $1 = last_key and $2 = batch_size; $3 = the declared population ids, $4 / $5 = the street / zone radius in metres and
 * $6 = the bbox degree divisor are placeholders that buildSourceSql replaces with the validated ctx.config values as checked literals
 * (settingLiterals; operator "option 2" 2026-11-11).
 * MB-31 plan section 22 (operator "a yes" 2026-11-11, D-2 a): reads 5 bind the radius (exact geography distance); read 6 returns the
 * street-scoped abutment rows (both lots on the subject's primary_frontage_street_name), and the compute walks the ring (ringLots).
 */
const READ_SQL = Object.freeze({
  cells: `SELECT r.parcel_id, r.lot_gate, r.class, r.structure, r.target, r.status, r.value_kind, r.value, r.reason, r.winner_unit_id
  FROM bylaw_resolution_results r
 WHERE r.parcel_id = s.id`,
  // MB-27 R2 (M-400, M-465; plan-reader-and-mech.md 1.4 R2 (1)): the design-option slots and the threshold (option NULL), migration 295
  options: `SELECT o.parcel_id, o.lot_gate, o.class, o.structure, o.target, o.option, o.status, o.value_kind, o.value, o.reason, o.winner_unit_id
  FROM bylaw_resolution_option_results o
 WHERE o.parcel_id = s.id`,
  // Q-STOR a (migration 295): the lot stamps are stored as bytea; Layer 3 reads them as hex through the view bylaw_resolution_lot_stamps
  lots: `SELECT l.parcel_id, l.lot_gate, l.permitted, l.permitted_text_ids, l.table_version, l.evaluator_version
  FROM bylaw_resolution_lot_stamps l
 WHERE l.parcel_id = s.id`,
  // MB-27 increment 3, DL-21 a (D-8 read wiring): the parcels columns resolve_bylaws reads (resolve-bylaws.js buildSourceSql), so buildLotVector can rebuild the lot vector; the geometry inputs come from the same row
  parcel: `SELECT p.id, p.parcel_id, p.zoning_class, p.zoning_zn_string, p.exception_number, p.zoning_overlays, p.on_policy_road, p.is_corner_lot,
       p.is_through_lot, p.abuts_laneway, p.frontage_m, p.depth_m, p.lot_size_sqm, p.zoning_is_ambiguous, p.in_sixplex_area, p.is_heritage_designated,
       ST_NPoints(p.geom)::int AS geom_npoints
  FROM parcels p
 WHERE p.id = s.id`,
  abutters: `SELECT a.parcel_id, a.neighbour_id, a.shared_len_m::double precision AS shared_len_m, a.front_setback_est_m::double precision AS est, a.est_status, a.bldg_to_subject_m::double precision AS bldg_m, a.same_frontage_street AS same_street, a.neighbour_residential AS residential
  FROM parcel_abutments a
 WHERE a.parcel_id = s.id`,
  // read 5, street: the same-frontage-street lots within the street radius, each with its one estimate as a neighbour; the subject's
  // abutters excluded (E31-01); the gist prefilter widens metres into degrees by the divisor and the exact cut is the geography distance
  street_pool: `SELECT q.id, (SELECT e.front_setback_est_m::double precision FROM parcel_abutments e WHERE e.neighbour_id = q.id AND e.est_status = 'estimated' ORDER BY e.parcel_id LIMIT 1) AS est
  FROM parcels q
 WHERE q.geom && ST_Expand(s.geom, $4::double precision / $6::double precision)
   AND q.primary_frontage_street_name = s.primary_frontage_street_name
   AND q.id <> s.id
   AND ST_DWithin(q.geom::geography, s.geom::geography, $4::double precision)
   AND NOT EXISTS (SELECT 1 FROM parcel_abutments x WHERE x.parcel_id = s.id AND x.neighbour_id = q.id)`,
  // read 5, zone: the same-zone lots within the zone radius; the gist prefilter widens metres into degrees by the divisor
  // (D-4: it over-covers while the divisor is at most a degree of longitude in metres), and the exact cut is the geography distance
  zone_pool: `SELECT p.id, (SELECT e.front_setback_est_m::double precision FROM parcel_abutments e WHERE e.neighbour_id = p.id AND e.est_status = 'estimated' ORDER BY e.parcel_id LIMIT 1) AS est
  FROM parcels p
 WHERE p.geom && ST_Expand(s.geom, $5::double precision / $6::double precision)
   AND p.zoning_class = s.zoning_class
   AND p.id <> s.id
   AND ST_DWithin(p.geom::geography, s.geom::geography, $5::double precision)
   AND NOT EXISTS (SELECT 1 FROM parcel_abutments x WHERE x.parcel_id = s.id AND x.neighbour_id = p.id)`,
  // read 6 (MB-31 plan 21.2 / 22): every parcel_abutments row whose lot and neighbour both have the subject's frontage street (plain
  // equality: a null street matches nothing), each with the neighbour's one estimate; no depth here, the compute walks the ring
  ring_edges: `SELECT q.id AS parcel_id, n.id AS neighbour_id, a.shared_len_m::double precision AS shared_len_m, (SELECT e.front_setback_est_m::double precision FROM parcel_abutments e WHERE e.neighbour_id = n.id AND e.est_status = 'estimated' ORDER BY e.parcel_id LIMIT 1) AS est
  FROM parcels q
  JOIN parcel_abutments a ON a.parcel_id = q.id
  JOIN parcels n ON n.id = a.neighbour_id AND n.primary_frontage_street_name = s.primary_frontage_street_name
 WHERE q.primary_frontage_street_name = s.primary_frontage_street_name`,
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
 * MB-27 increment 3, E7 item 2 (M-494): `parcelInput.buildingType` names ONE building type id; when it is set only that
 * type is run (so `oneParcel`'s per-type loop does not loop the types a second time). Unset: every type, as before.
 * @param {{parcel_id: number, buildingType?: string, l2: object, perm: object, geometry: object, flags: object, neighbours: object, settings?: object}} parcelInput
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
  const only = typeof p.buildingType === 'string' ? p.buildingType : null;
  for (const bt of toList(seeds && seeds.buildingTypes && seeds.buildingTypes.rows)) {
    if (only !== null && bt.id !== only) continue;
    const results = runAllRows({ ...inputs, buildingType: bt.id });
    for (const result of results) out.push(dbRow(p.parcel_id, bt.id, bt.increment, result, s));
  }
  return out;
}

const round9 = (x) => Math.round(x * 1e9) / 1e9;

/** The reason a gain is NULL: the first of the rows that is not permitted / not computed, its reason propagating unchanged (else its status word). */
function nullReason(perms, fields) {
  for (const r of perms) if (!r || r.status !== 'permitted') return (r && (r.reason || r.status)) || 'missing_input:permitted';
  for (const r of fields) if (!r || r.status !== 'computed' || typeof r.value !== 'number') return (r && (r.reason || r.status)) || 'missing_input:absent_target';
  return null;
}

function switchOf(seeds, id) {
  const row = findById(seeds && seeds.switchboard && seeds.switchboard.rows, id);
  return { id, state: row && row.state === 'off' ? 'off' : 'on' };
}

/** The decoded Phase 2 principal cells of a run's input whose value differs between two types. */
function differingTargets(a, b) {
  const x = a || {};
  const y = b || {};
  return [...new Set([...Object.keys(x), ...Object.keys(y)])].sort().filter((t) => JSON.stringify(x[t] ?? null) !== JSON.stringify(y[t] ?? null));
}

const optionCellsOf = (o) => JSON.stringify({ runs: (o && o.runs) || {}, shared: (o && o.shared) || {} });

/** The releasing clause a decoded cell carries: the winner unit, or for a not_applicable cell the disapplying unit (vocab layer3.status_form: not_applicable "<clause>"). */
const releasingClause = (cell) => (cell.s === 'not_applicable' && typeof cell.reason === 'string' ? cell.reason : cell.clause) ?? null;

/**
 * D-2 a (MB-27 increment 4, operator 2026-11-11; Spec 69a M-379 dated note 2026-11-11; LC-33; Spec 78 P5.2 item 11): the LC-33 gain
 * of every building type whose seed row names a `base_type`, taken right after the step's one per-type loop, where both types' rows
 * exist. Everything it compares and every reason it can name is data (`seeds.buildingTypes.gain`): the gain fields (type row minus
 * base row of the same catalogue id), the reasons keyed by the releasing clause, the fail-closed reason. A mapped reason is named only
 * when swapping that one Phase 2 cell into the base type's run moves a compared row (the "actually bound" test); a differing cell whose
 * clause is not mapped, or any differing roof-option cell, fails the reasons row closed (M-379, MB-64). No id, zone or clause in code.
 * @param {number} parcelId
 * @param {Object<string, {input: object, rows: object[]}>} perType the per-type parcel input and the emitted rows of this parcel
 * @param {object} seeds
 * @param {{settings_sha?: string, layer2_table_version?: string}} meta
 */
function gainRows(parcelId, perType, seeds, meta) {
  const decl = seeds && seeds.buildingTypes && seeds.buildingTypes.gain;
  if (!decl || typeof decl !== 'object') return [];
  const fields = toList(decl.fields);
  const s = shas(seeds, meta);
  const out = [];
  for (const bt of toList(seeds.buildingTypes.rows)) {
    if (!bt || typeof bt.base_type !== 'string') continue;
    const mine = perType[bt.id];
    const base = perType[bt.base_type];
    const baseBt = findById(seeds.buildingTypes.rows, bt.base_type);
    if (!mine || !base || !baseBt) continue; // a type not run here has no gain to take
    const byId = (rows) => new Map(toList(rows).map((r) => [r.field_id, r]));
    const m = byId(mine.rows);
    const b = byId(base.rows);
    const perms = [b.get(decl.permission_row), m.get(decl.permission_row)];
    const switches = [switchOf(seeds, bt.switch), switchOf(seeds, baseBt.switch)];
    // M-386 R3-02 (OUTPUT panel fold): a gain row reads both types' rows, so it carries every flag either row carries
    const flagsOf = (rows) => [...new Set(rows.flatMap((r) => toList(r && r.flags)))];
    const rowTrace = (f) => [
      { kind: 'row', id: f.row, building_type: bt.id, status: (m.get(f.row) || {}).status ?? null },
      { kind: 'row', id: f.row, building_type: bt.base_type, status: (b.get(f.row) || {}).status ?? null },
    ];
    let anyNull = null;
    for (const f of fields) {
      const why = nullReason(perms, [m.get(f.row), b.get(f.row)]);
      if (why !== null && anyNull === null) anyNull = why;
      const result = why !== null
        ? { row: f.id, status: 'not_evaluated', value: null, unit: f.unit, reason: why, flags: flagsOf([m.get(f.row), b.get(f.row)]), trace: rowTrace(f), switches }
        : { row: f.id, status: 'computed', value: round9(m.get(f.row).value - b.get(f.row).value), unit: f.unit, reason: null, flags: flagsOf([m.get(f.row), b.get(f.row)]), trace: rowTrace(f), switches };
      out.push(dbRow(parcelId, bt.id, bt.increment, result, s));
    }
    if (typeof decl.reasons_field !== 'string') continue;
    const readFlags = flagsOf(fields.flatMap((f) => [m.get(f.row), b.get(f.row)]));
    if (anyNull !== null) {
      out.push(dbRow(parcelId, bt.id, bt.increment, { row: decl.reasons_field, status: 'not_evaluated', value: null, unit: null, reason: anyNull, flags: readFlags, trace: [], switches }, s));
      continue;
    }
    // the reasons: each differing principal cell, by the clause it carries
    const trace = [];
    const named = new Set();
    let open = optionCellsOf(mine.input.l2Options) !== optionCellsOf(base.input.l2Options);
    if (open) trace.push({ kind: 'l2', id: 'options', clause: null, reason: null, bound: null });
    for (const t of differingTargets(mine.input.l2, base.input.l2)) {
      const cell = mine.input.l2[t] || {};
      const clause = releasingClause(cell);
      const entry = toList(decl.reasons).find((r) => r && toList(r.units).includes(clause));
      if (!entry) {
        open = true;
        trace.push({ kind: 'l2', id: t, clause, reason: null, bound: null });
        continue;
      }
      const swapped = byId(buildParcelRows({ ...base.input, buildingType: bt.base_type, l2: { ...base.input.l2, [t]: cell } }, seeds, meta));
      const bound = fields.some((f) => {
        const x = swapped.get(f.row);
        const y = b.get(f.row);
        return !x || !y || x.status !== y.status || round9((x.value ?? 0) - (y.value ?? 0)) !== 0;
      });
      if (bound) named.add(entry.reason);
      trace.push({ kind: 'l2', id: t, clause, reason: entry.reason, bound });
    }
    const result = open
      ? { row: decl.reasons_field, status: 'not_evaluated', value: null, unit: null, reason: decl.fail_reason, flags: readFlags, trace, switches }
      : { row: decl.reasons_field, status: 'computed', value: null, unit: null, reason: null, flags: [...(named.size ? [...named] : [decl.none_word]), ...readFlags], trace, switches };
    out.push(dbRow(parcelId, bt.id, bt.increment, result, s));
  }
  return out;
}

/**
 * RV-2: the census of a list of emitted rows — the three counts `oneParcel` has always summed, plus the closure
 * violations (a trace entry naming a variable / target / geometry / fact the catalogue does not declare) and the
 * flags-missing count (a not_applicable / not_evaluated row with neither a flag nor a reason).
 */
function censusOf(rows, U, floorCensus) {
  const u = U || {};
  const fc = floorCensus && typeof floorCensus === 'object' ? floorCensus : null;
  const lvKeys = u.lv || {};
  const nameKeys = u.names || {};
  const counts = { status_outside_closed_set: 0, numbers_without_trace: 0, not_buildable_with_value: 0, closure_violations: 0, flags_missing: 0, units_floor_refusals: 0 };
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
    // E7 (M-344 dated note 2026-11-11): the refusals of the declared row and word (building-types.json units_floor_census), counted
    if (fc && row.status === 'not_evaluated' && row.field_id === fc.row && row.reason === fc.reason) counts.units_floor_refusals += 1;
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
  const census = { layer2_cell_unparseable: unparseable, status_outside_closed_set: 0, numbers_without_trace: 0, not_buildable_with_value: 0, closure_violations: 0, flags_missing: 0, units_floor_refusals: 0 };
  const U = cat.unitsFor(L.seeds && L.seeds.catalogue, L.vocab);
  const perType = {};
  for (const bt of toList(L.seeds && L.seeds.buildingTypes && L.seeds.buildingTypes.rows)) {
    const perm = l2Classes.includes(bt.class)
      ? cellsLib.decodePermission(source.lot || {}, bt.class, { classes: l2Classes, permissionKeys: L.permissionKeys, texts: L.texts })
      : {};
    const g = source.geometry || {};
    const words = l2Classes.includes(bt.class) ? disclosureWords(source, bt, Object.keys(decoded[bt.id]), L) : { l2Flags: {}, permFlags: [] };
    const parcelInput = {
      parcel_id: source.parcel_id,
      buildingType: bt.id, // E7 item 2 (M-494): buildParcelRows runs this one type; the loop above is the only per-type loop
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
      // D8-SHELL (MB-31 (e)): the reader's INPUT, not its facts: rows.js runs neighbourFacts itself with the run's own averaging cell
      // (rows.js cellsOfRun); handing it facts made every neighbour count read 0 on stored rows. bt_units is the building-types row's;
      // own and user stay empty: no declared read carries them (the golden-25 inputs carry none either).
      neighbours: { user: [], neighbours: toList(source.abutters), own: null, street: toList(source.street), zone: toList(source.zone), ring: toList(source.ring), bt_units: bt.units },
    };
    const rowsOfType = buildParcelRows(parcelInput, L.seeds, meta);
    perType[bt.id] = { input: parcelInput, rows: rowsOfType };
    for (const r of rowsOfType) out.push(r);
  }
  // D-2 a (M-379 dated note 2026-11-11): the one generic gain comparison, right after the per-type loop
  for (const r of gainRows(source.parcel_id, perType, L.seeds, meta)) out.push(r);
  const counted = censusOf(out, U, L.seeds && L.seeds.buildingTypes && L.seeds.buildingTypes.units_floor_census);
  for (const k of ['status_outside_closed_set', 'numbers_without_trace', 'not_buildable_with_value', 'closure_violations', 'flags_missing', 'units_floor_refusals']) census[k] = counted[k];
  return { rows: out, census };
}

/**
 * The rows arm (R-EH): one source row per parcel -> every parcel_maxbld_scenarios row of that parcel. Pure.
 * @param {object[]} sourceRows
 * @param {{config?: object, lookups: object}} ctx
 */
function materializeParcels(sources, lookups) {
  const e1 = [];
  const matched = { parcels: 0, processed: 0, rows_emitted: 0, layer2_cell_unparseable: 0, status_outside_closed_set: 0, numbers_without_trace: 0, not_buildable_with_value: 0, closure_violations: 0, flags_missing: 0, units_floor_refusals: 0 };
  for (const source of toList(sources)) {
    const one = oneParcel(source, lookups || {});
    e1.push(...one.rows);
    matched.parcels += 1;
    matched.processed += 1;
    matched.rows_emitted += one.rows.length;
    for (const k of ['layer2_cell_unparseable', 'status_outside_closed_set', 'numbers_without_trace', 'not_buildable_with_value', 'closure_violations', 'flags_missing', 'units_floor_refusals']) matched[k] += one.census[k];
  }
  return { rows: { e1 }, matched };
}

// ---- D8-SHELL: the runtime loader (MB-31 (e); operator "a yes" 2026-11-11; card ~/Buildo-scratch/mcbylaws/inc3/build/CARD-d8-shell.md) ----

/** The order of each aggregated read inside the batch statement (json_agg keeps it; the compute never relies on row order). */
const READ_ORDER = Object.freeze({
  cells: 'x.class, x.structure, x.target',
  options: 'x.class, x.structure, x.target, x.option',
  abutters: 'x.neighbour_id',
  street_pool: 'x.id',
  zone_pool: 'x.id',
  ring_edges: 'x.parcel_id, x.neighbour_id',
});

/** The declared config.logic_variables entries the batch statement carries as checked literals, in $3.. placeholder order. */
const BATCH_CONFIG_BINDS = Object.freeze([
  'compute_maxbld_scenarios_population_parcel_ids',
  'fya_placeholder_street_radius_m',
  'fya_placeholder_zone_radius_m',
  'compute_maxbld_scenarios_bbox_degree_divisor',
]);

/**
 * The settings of the batch statement as checked SQL literals (operator "option 2" 2026-11-11, STOP-11: no runner change now; the
 * enrich-parcels.js bboxDivisor and enrich-centreline.js proximityM precedent of a validated ctx.config value rendered into the SQL).
 * Each population id must be a non-negative integer (the setting is a list of decimal strings); every other value must be a finite
 * number. Anything else throws before a statement is built, so only digits, a dot, a minus sign or an exponent reach the SQL text.
 * @returns {Record<number, string>} placeholder number -> literal
 */
function settingLiterals(config) {
  const c = config || {};
  const ids = c[BATCH_CONFIG_BINDS[0]];
  if (!Array.isArray(ids)) throw new Error(`compute_maxbld_scenarios: ${BATCH_CONFIG_BINDS[0]} is not a list`);
  const ints = ids.map((x) => {
    const t = typeof x === 'number' ? String(x) : x;
    if (typeof t !== 'string' || !/^[0-9]+$/.test(t) || !Number.isSafeInteger(Number(t))) throw new Error(`compute_maxbld_scenarios: population id ${JSON.stringify(x)} is not an integer`);
    return Number(t);
  });
  const out = { 3: `ARRAY[${ints.join(', ')}]::int[]` };
  BATCH_CONFIG_BINDS.slice(1).forEach((name, i) => {
    const v = c[name];
    if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`compute_maxbld_scenarios: ${name} ${JSON.stringify(v)} is not a finite number`);
    out[i + 4] = `${String(v)}::double precision`;
  });
  return out;
}

/**
 * R-EH (a) (the rows arm): the source statements. The population is the declared golden-25 setting plus the cohort table parcel_maxbld_population
 * (D-3 a); one page of ids by keyset, then the eight reads per lot as JSON. The settings are written in as checked literals
 * (settingLiterals); the runner binds only last_key and batch_size (count_binds none). `count_sql` counts the cohort table only
 * (records_total is matched.processed, the parcels the compute received).
 * @returns {{count_sql: string, count_binds: string[], batch_sql: string, batch_binds: string[]}}
 */
function buildSourceSql(_descriptor, config, _opts) {
  const lit = settingLiterals(config);
  // each placeholder ($3-$6, with its cast) becomes the checked literal in parentheses; the runner binds only $1 and $2
  const render = (sql) => sql.replace(/\$([3-6])(::[a-z ]+(\[\])?)?/g, (_m, n) => `(${lit[n]})`);
  const one = (k) => `(SELECT row_to_json(x) FROM (${READ_SQL[k]}) x)`;
  const many = (k) => `(SELECT COALESCE(json_agg(x ORDER BY ${READ_ORDER[k]}), '[]'::json) FROM (${READ_SQL[k]}) x)`;
  return {
    count_sql: 'SELECT COUNT(*)::int AS cohort_lots FROM parcel_maxbld_population',
    count_binds: [],
    batch_sql: render(`WITH page AS (
  SELECT pop.id
    FROM (SELECT unnest($3::int[]) AS id UNION SELECT c.parcel_id AS id FROM parcel_maxbld_population c) pop
   WHERE pop.id > $1
   ORDER BY pop.id
   LIMIT $2
), subject AS (
  SELECT page.id, p.geom, p.zoning_class, p.primary_frontage_street_name
    FROM page
    LEFT JOIN parcels p ON p.id = page.id
)
SELECT s.id,
       ${one('parcel')} AS parcel,
       ${one('lots')} AS lot,
       ${many('cells')} AS cells,
       ${many('options')} AS options,
       ${many('abutters')} AS abutters,
       ${many('street_pool')} AS street,
       ${many('zone_pool')} AS zone,
       ${many('ring_edges')} AS ring_edges
  FROM subject s
 ORDER BY s.id`),
    batch_binds: ['last_key', 'batch_size'],
  };
}

const hasOwn = (o, k) => o !== null && typeof o === 'object' && Object.prototype.hasOwnProperty.call(o, k);

/**
 * MB-31 plan 19.2 steps 1-4 (L31-15), walked in the compute (21.2 / 22): from each start abutter (an abutment of the subject on its
 * frontage street, level 1), step to the abutter of the current lot that is not the subject, not already in this chain and not a start
 * abutter, the largest shared_len_m first and the lowest lot id on a tie; a step with no candidate ends the chain; levels 2..depth.
 * The ring is the distinct lots reached (each once), with the lot's one estimate as a neighbour (null keeps its place, adds no fact).
 * @param {number} subjectId @param {Array<{parcel_id:number, neighbour_id:number, shared_len_m:number, est:number|null}>} edges @param {number} depth
 */
function ringLots(subjectId, edges, depth) {
  if (!Number.isInteger(depth)) throw new Error(`compute_maxbld_scenarios: the ring depth ${JSON.stringify(depth)} is not an integer (fya_placeholder_ring_depth)`);
  const adj = new Map();
  const estOf = new Map();
  for (const e of toList(edges)) {
    if (!e) continue;
    if (!adj.has(e.parcel_id)) adj.set(e.parcel_id, []);
    adj.get(e.parcel_id).push(e);
    estOf.set(e.neighbour_id, typeof e.est === 'number' ? e.est : null);
  }
  const starts = [...new Set(toList(adj.get(subjectId)).map((e) => e.neighbour_id))].sort((a, b) => a - b);
  const startSet = new Set(starts);
  const ring = new Set();
  for (const a of starts) {
    const chain = new Set([subjectId, a]);
    let cur = a;
    for (let level = 2; level <= depth; level += 1) {
      const next = toList(adj.get(cur))
        .filter((e) => e.neighbour_id !== subjectId && !chain.has(e.neighbour_id) && !startSet.has(e.neighbour_id))
        .sort((x, y) => (y.shared_len_m - x.shared_len_m) || (x.neighbour_id - y.neighbour_id))[0];
      if (!next) break;
      chain.add(next.neighbour_id);
      ring.add(next.neighbour_id);
      cur = next.neighbour_id;
    }
  }
  return [...ring].sort((a, b) => a - b).map((id) => ({ id, est: estOf.has(id) ? estOf.get(id) : null }));
}

/**
 * The lookups oneParcel reads, assembled ONCE per run from the runner's role:"lookup" rows and the validated ctx.config: the seed files
 * (static requires, the resolve-bylaws precedent), every catalogue setting's value from ctx.config (a catalogue setting with no
 * config value throws: a seed is bootstrap only, Spec 122 1.2a P4), settings_sha over exactly those values, the permission keys of the
 * Layer 2 map, the stored text dictionary, and the Layer 1 env for the D-8 disclosure recompute (its zone list is the stored
 * resolve_bylaws population setting, read from the declared logic_variables lookup; absent or not a list throws).
 */
let lookupsMemo = { raw: null, config: null, L: null };
function lookupsFor(raw, config) {
  if (lookupsMemo.raw === raw && lookupsMemo.config === config && lookupsMemo.L) return lookupsMemo.L;
  const logicVariables = { ...LV_SEED };
  for (const s of toList(CATALOGUE.settings)) {
    if (!hasOwn(config, s.id)) throw new Error(`compute_maxbld_scenarios: catalogue setting ${s.id} has no validated ctx.config value (declare it in config.logic_variables)`);
    logicVariables[s.id] = { ...(LV_SEED[s.id] || {}), value: config[s.id] };
  }
  const seeds = { catalogue: CATALOGUE, switchboard: SWITCHBOARD, buildingTypes: BUILDING_TYPES, logicVariables, vocab: VOCAB, layer2Classes: SCOPE.classes, layer2Options: SCOPE.options };
  const textRows = toList(raw.bylaw_resolution_texts);
  const texts = {};
  for (const t of textRows) texts[String(t.text_key)] = t.text;
  const zoneRow = toList(raw.logic_variables).find((r) => r && r.variable_key === LAYER2_ZONE_LIST);
  const zoneList = zoneRow ? zoneRow.variable_value_json : undefined;
  if (!Array.isArray(zoneList)) throw new Error(`compute_maxbld_scenarios: the logic_variables lookup has no list ${LAYER2_ZONE_LIST} (the Layer 1 env of the D-8 recompute needs the zone list Layer 2 ran with)`);
  const L = {
    seeds,
    vocab: VOCAB,
    layer2Classes: SCOPE.classes,
    permissionKeys: Object.keys(MAP.permission_image),
    texts,
    dicts: lr.makeDecodeDicts({ units: toList(raw.bylaw_resolution_units), texts: textRows }),
    layer1Env: makeEnv({ body: INPUT.body, map: MAP, scope: SCOPE, vocab: VOCAB, zoneList, versions: { table_version: INPUT.table_version, evaluator_version: INPUT.evaluator_version } }),
    settings_sha: cat.sha256(cat.settingVals(CATALOGUE, logicVariables)),
  };
  lookupsMemo = { raw, config, L };
  return L;
}

/** One batch row (buildSourceSql) -> the oneParcel source. A population id with no parcels row or no Layer 2 stamp halts the run (fail closed; never dropped). */
function sourceOf(r, L, depth) {
  if (!r || !r.parcel) throw new Error(`compute_maxbld_scenarios: population id ${r && r.id} matches no parcels row`);
  if (!r.lot) throw new Error(`compute_maxbld_scenarios: population parcel ${r.id} has no Layer 2 stamp (bylaw_resolution_lot_stamps)`);
  const p = r.parcel;
  return {
    parcel_id: r.id,
    cells: toList(r.cells),
    options: toList(r.options),
    lot: r.lot,
    parcel: p,
    geometry: { frontage_m: p.frontage_m, depth_m: p.depth_m, lot_size_sqm: p.lot_size_sqm, is_corner_lot: p.is_corner_lot },
    abutters: toList(r.abutters),
    street: toList(r.street),
    zone: toList(r.zone),
    ring: ringLots(r.id, r.ring_edges, depth),
    permitted_by_class: lr.decodePermitted({ lot: r.lot, classes: SCOPE.classes, map: MAP, dicts: L.dicts }),
  };
}

/**
 * The rows arm (R-EH (c)): one batch row per population parcel -> every parcel_maxbld_scenarios row of that parcel. The runner passes
 * its raw lookups and the validated config; the loader assembles them (lookupsFor) and walks the ring to the configured depth. An empty
 * page computes nothing and returns the census at 0 (R-JG).
 * @param {object[]} sourceRows
 * @param {{config?: object, lookups?: object}} ctx
 */
function materializeRows(sourceRows, ctx) {
  const list = toList(sourceRows);
  if (list.length === 0) return materializeParcels([], {});
  const c = ctx || {};
  const config = c.config || {};
  const L = lookupsFor(c.lookups || {}, config);
  const depth = Number(config.fya_placeholder_ring_depth);
  return materializeParcels(list.map((r) => sourceOf(r, L, depth)), L);
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
module.exports.gainRows = gainRows;
module.exports.contentSha = contentSha;
module.exports.censusOf = censusOf;
module.exports.materializeRows = materializeRows;
module.exports.materializeParcels = materializeParcels;
module.exports.buildSourceSql = buildSourceSql;
module.exports.settingLiterals = settingLiterals;
module.exports.ringLots = ringLots;
module.exports.lookupsFor = lookupsFor;
module.exports.READ_SQL = READ_SQL;
module.exports.CHECKS = CHECKS;
/** Spec 122 §5.5 (1): the dispatch table under the name the conformance battery reads (descriptor order). */
module.exports.checks = CHECKS;
module.exports.CLOSED_STATUSES = CLOSED_STATUSES;
module.exports.populationIds = populationIds;
module.exports.disclosureWords = disclosureWords;
