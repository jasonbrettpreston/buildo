'use strict';
/**
 * resolve_bylaws — the pure compute (MATERIALIZER, `execution.materialize_form: "rows"`; Layer 2 by-law resolution).
 *
 * SPEC LINK: docs/specs/01-pipeline/134_resolve_bylaws.md §2 (inputs through effective() only), §3 (row shape), §5, §6, §7 (checks I1-I15)
 * SPEC LINK: docs/specs/01-pipeline/124a_step_standard_policy_appendix.md R-IL (the one generated Layer 1 input), R-IU (the population and the
 *            replace-keys retraction), R-EH (the rows arm), R-IN, R-IO, R-IP, R-IQ, R-IR, R-IT
 * Handbook: Spec 132 §materializer.1 (R-EH); Spec 132 §core.9 (R-W, R-BZ: compute is pure)
 * Operator: CHAT-80.QP (option 4: one row per lot, positional arrays in scope-seed order, two closed dictionaries); CHAT-77.freeze (the logical row)
 *
 * The runner pages `parcels` (every parcel, R-IU), reads the two dictionary tables once (role "lookup"), and writes the four targets of
 * `outputs.writes[]` in one transaction per batch. This module holds no query beyond the declared source and post statements, no transaction,
 * no clock, no literal tunable and no status decision: the evaluator is imported through `../bylaw-materialize.js` (which requires evaluate.mjs)
 * and Layer 1 reaches it as the one generated file docs/reference/bylaw-layer2-input.json (R-IL), required statically so the read is a declared
 * edge of the compute closure (gate E).
 *
 * Targets (descriptor `outputs.writes[]` order; each file `eN` is `write.targetKey(N-1)`):
 *   e1 bylaw_resolution_units   A guarded_upsert   (the closed unit-id dictionary; key = hash32 of the unit id)
 *   e2 bylaw_resolution_texts   A guarded_upsert   (the closed text dictionary: reasons, evidence refs, permission clause lists)
 *   e3 bylaw_resolution_lots    F replace_keys     (parcels that left the population, R-IU)
 *   e4 bylaw_resolution_lots    A guarded_upsert   (the lot row: positional arrays in layer2-scope.json pair order)
 * Parents (dictionaries) are written before the lot rows inside the batch transaction, and the retraction before the upsert of the same table.
 *
 * Open questions (Q-x) are marked where the plain Spec 134 reading is implemented: Q-F (scenario-axis results are a WARN), Q-I (row_sha
 * recomputed in SQL), Q-J (the population is one list variable), Q-N (the equivalence sample is the budget).
 */

const { makeEnv, seedDictionaries, materializeBatch, RESULT_COLUMNS, rowShaMismatchSql } = require('../bylaw-materialize.js');
const rb = require('../bylaw-resolution.js');
const lr = require('../bylaw-lot-row.js');
const INPUT = require('../../../docs/reference/bylaw-layer2-input.json');
const MAP = require('../../seeds/bylaw/layer2-map.json');
const SCOPE = require('../../seeds/bylaw/layer2-scope.json');
const VOCAB = require('../../seeds/bylaw/vocab.json');

/** The three tables, in dependency order (dictionaries first). */
const TABLES = Object.freeze({
  units: 'bylaw_resolution_units',
  texts: 'bylaw_resolution_texts',
  lots: 'bylaw_resolution_lots',
});
const VERSIONS = Object.freeze({ table_version: INPUT.table_version, evaluator_version: INPUT.evaluator_version });
const DAY_NUMBER_SQL = 'EXTRACT(EPOCH FROM $3::timestamptz)::bigint / 86400';

/**
 * The source statements (R-EH (a)). The runner binds `batch_binds` in order. There is no pending predicate and no full mode: the step is a
 * full rescan (Spec 134 §7, `mode_select: "none"`), and the source pages EVERY parcel so a parcel that left the population is retracted (R-IU).
 * `run_day` is the runner's run_at day number ($3), the seed of the audit offset (Q-N): the compute reads no clock of its own.
 * @returns {{count_sql: string, batch_sql: string, batch_binds: string[]}}
 */
function buildSourceSql(_descriptor, _config, _opts) {
  return {
    count_sql: 'SELECT COUNT(*)::int AS parcels_scanned FROM parcels',
    batch_sql: `SELECT id, parcel_id, zoning_class, zoning_zn_string, exception_number, zoning_overlays, on_policy_road, is_corner_lot,
       is_through_lot, abuts_laneway, frontage_m, depth_m, lot_size_sqm, zoning_is_ambiguous, in_sixplex_area, is_heritage_designated,
       ST_NPoints(geom)::int AS geom_npoints, (${DAY_NUMBER_SQL})::bigint AS run_day
  FROM parcels
 WHERE id > $1
 ORDER BY id ASC
 LIMIT $2`,
    batch_binds: ['last_key', 'batch_size', 'run_at'],
  };
}

/** One env per distinct (population, audit) setting; the evaluator context and its cells are built once and reused across batches. */
let envMemo = { key: null, env: null };
function envFor(config, runDay) {
  const zoneList = config.resolve_bylaws_population_zone_classes;
  const nth = config.resolve_bylaws_equivalence_every_nth;
  const offset = Number(runDay) % nth;
  const key = `${zoneList.join(',')}|${nth}|${offset}`;
  if (envMemo.key !== key) {
    envMemo = { key, env: makeEnv({ body: INPUT.body, map: MAP, scope: SCOPE, vocab: VOCAB, zoneList, versions: VERSIONS, audit: { everyNth: nth, offset } }), seeded: false };
  }
  return envMemo;
}

/** A jsonb column is bound as its JSON text: node-pg would send a JS array as a Postgres array literal (the int2[] / float8[] columns are fine). */
const jsonText = (v) => (v === null ? null : JSON.stringify(v));

/**
 * One batch: parcels rows -> the target rows (R-EH (c)). Pure. `replace_keys.e3` are the parcel ids that left the population. `lookups` holds the
 * stored dictionary rows (read once before the loop): they seed the collision check, so a fresh key that hashes onto a stored entry with other
 * content fails loud instead of overwriting it.
 * @param {object[]} sourceRows
 * @param {{config: object, lookups?: Record<string, object[]>}} ctx
 */
function materializeRows(sourceRows, { config, lookups }) {
  const runDay = sourceRows.length ? sourceRows[0].run_day : 0;
  const memo = envFor(config, runDay);
  if (!memo.seeded) {
    seedDictionaries(memo.env, { units: (lookups && lookups[TABLES.units]) || [], texts: (lookups && lookups[TABLES.texts]) || [] });
    memo.seeded = true;
  }
  const out = materializeBatch(sourceRows, memo.env);
  const r = out.rows;
  return {
    rows: {
      e1: r.units,
      e2: r.texts,
      e4: r.lots.map((l) => ({ ...l, class_results: jsonText(l.class_results) })),
    },
    replace_keys: { e3: out.retract },
    matched: out.matched,
  };
}

/**
 * Every stored (lot, position) result as one row: the representative arrays plus the sparse per-class overrides (class_results holds
 * class -> pair index -> [code, value, reason_id, winner_id, evidence_kind, evidence_ref_id]). Columns: parcel_id, lot_gate, i (1-based), code,
 * w (winner key), ek (evidence kind index), rid (reason key), ref (evidence ref key).
 * Each set-returning function names its output columns so the #44 witness can bind them (CHAT-127.L2-WIT-1).
 */
function resultsSql() {
  const L = TABLES.lots;
  return `(SELECT l.parcel_id, l.lot_gate, t.i, t.code, t.w, t.ek, t.rid, t.ref
        FROM ${L} l, unnest(l.codes, l.winner_ids, l.evidence_kinds, l.reason_ids, l.evidence_ref_ids) WITH ORDINALITY AS t(code, w, ek, rid, ref, i)
      UNION ALL
      SELECT l.parcel_id, l.lot_gate, (p.pos::int + 1)::bigint, (p.cell->>0)::int, (p.cell->>3)::int, (p.cell->>4)::int, (p.cell->>2)::int, (p.cell->>5)::int
        FROM ${L} l, jsonb_each(l.class_results) AS c(cls, pairs), jsonb_each(c.pairs) AS p(pos, cell))`;
}

/**
 * The once-per-run post read (R-EH (e)): every table-level truth the checks need, one statement, one row of counts. The population is
 * the config list; the pair count, the classes and the class cap are declared data, passed as parameters. Code and evidence-kind positions
 * come from layer2-map.json (never typed here).
 */
function buildPostSql(_descriptor, config) {
  const zones = config.resolve_bylaws_population_zone_classes;
  const pairs = rb.scopePairs(SCOPE).length;
  const T = TABLES;
  const codes = lr.resultCodes(MAP);
  const appliesCodes = codes.map((c, i) => [c, i]).filter(([c]) => c.startsWith('applies:')).map(([, i]) => i).join(', ');
  const unregulated = codes.indexOf('applies:unregulated');
  const notEvaluated = codes.indexOf('not_evaluated');
  const evidenceWinner = ['clause', 'provincial'].map((k) => MAP.evidence_kind.indexOf(k)).join(', ');
  const R = resultsSql();
  const arrayCols = ['numbers', 'reason_ids', 'winner_ids', 'evidence_kinds', 'evidence_ref_ids'];
  const widthViolations = `(SELECT COUNT(*)::int FROM ${T.lots} WHERE cardinality(codes) <> $2::int OR ${arrayCols.map((c) => `(${c} IS NOT NULL AND cardinality(${c}) <> $2::int)`).join(' OR ')}
     OR cardinality(permitted) <> cardinality($4::text[]) OR (permitted_text_ids IS NOT NULL AND cardinality(permitted_text_ids) <> cardinality($4::text[])))`;
  const unitOrphans = `(SELECT COUNT(*)::int FROM ${R} r LEFT JOIN ${T.units} u ON u.unit_key = r.w WHERE r.w IS NOT NULL AND u.unit_key IS NULL)`;
  const textOrphans = `(SELECT COUNT(*)::int FROM (SELECT rid AS k FROM ${R} a WHERE rid IS NOT NULL UNION ALL SELECT ref FROM ${R} b WHERE ref IS NOT NULL
        UNION ALL SELECT x FROM ${T.lots} l, unnest(l.permitted_text_ids) AS x WHERE x IS NOT NULL) q LEFT JOIN ${T.texts} t ON t.text_key = q.k WHERE t.text_key IS NULL)`;
  const sql = `SELECT
  (SELECT COUNT(*)::int FROM ${T.lots}) AS lots_total,
  (SELECT COUNT(*)::int FROM parcels WHERE zoning_class = ANY($1::text[])) AS population_total,
  (SELECT COUNT(*)::int FROM ${T.lots} l JOIN parcels pa ON pa.id = l.parcel_id WHERE NOT (pa.zoning_class = ANY($1::text[]))) AS lots_outside_population,
  ${widthViolations} AS array_width_violations,
  ${unitOrphans} AS unit_orphans,
  ${textOrphans} AS text_orphans,
  (SELECT COUNT(*)::int FROM ${R} r WHERE r.code IN (${appliesCodes}) AND ((r.w IS NOT NULL AND (r.ek IS NULL OR r.ek NOT IN (${evidenceWinner})))
     OR (r.w IS NULL AND NOT ((r.code = ${unregulated} AND r.ek IS NOT NULL) OR r.ek IN (${evidenceWinner}))))) AS winner_evidence_violations,
  (SELECT COUNT(*)::int FROM ${R} r WHERE r.lot_gate IS NOT NULL AND (r.code <> ${notEvaluated} OR r.w IS NOT NULL)) AS gated_winner_violations,
  (SELECT COUNT(*)::int FROM ${R} r JOIN ${T.lots} l ON l.parcel_id = r.parcel_id JOIN parcels pa ON pa.id = l.parcel_id JOIN ${T.units} u ON u.unit_key = r.w
     WHERE pa.exception_number = ${MAP.exception_number_sentinel} AND u.layer = 'exception') AS sentinel_exception_winner_violations,
  (SELECT COUNT(*)::int FROM ${T.lots} WHERE lot_gate = 'exception_not_authored') AS exception_gated_lots,
  (SELECT COUNT(*)::int FROM ${T.lots} l WHERE l.class_results IS NOT NULL AND ((SELECT COUNT(*) FROM jsonb_object_keys(l.class_results)) + 1 > $3::int
     OR EXISTS (SELECT 1 FROM jsonb_object_keys(l.class_results) k WHERE k <> ALL($4::text[])))) AS class_cap_violations,
  ${rowShaMismatchSql(TABLES).map((q, i) => `(${q}) AS row_sha_mismatches_${i}`).join(',\n  ')},
  (SELECT COUNT(*)::int FROM ${T.units} u LEFT JOIN (SELECT DISTINCT w FROM ${R} x WHERE w IS NOT NULL) r ON r.w = u.unit_key WHERE r.w IS NULL) AS unreferenced_units,
  (SELECT COUNT(*)::int FROM ${T.texts} t LEFT JOIN (SELECT rid AS k FROM ${R} a UNION SELECT ref FROM ${R} b
        UNION SELECT x FROM ${T.lots} l, unnest(l.permitted_text_ids) AS x) r ON r.k = t.text_key WHERE r.k IS NULL) AS unreferenced_texts,
  (${Object.values(T).map((t) => `pg_total_relation_size('${t}')`).join(' + ')})::bigint AS storage_bytes`;
  return { post_sql: sql, post_binds: [], post_params: [zones, pairs, config.resolve_bylaws_class_cap, SCOPE.classes] };
}

/**
 * Derive the ratios once from the run-summed tallies and the post read (R-EH (c), (e)). `count` is the source count statement's row.
 */
function finalizeMatched(m, { config, post, count }) {
  const p = post || {};
  const n = (k) => Number(p[k]) || 0;
  const results = Object.values(m.results_by_status || {}).reduce((a, b) => a + b, 0);
  const notEvaluated = (m.results_by_status || {}).not_evaluated || 0;
  const mismatches = Object.keys(p).filter((k) => k.startsWith('row_sha_mismatches_')).reduce((a, k) => a + n(k), 0);
  const storage = rb.storageWithinBudget(n('storage_bytes'), config.resolve_bylaws_storage_budget_mb);
  return {
    ...m,
    parcels_scanned: Number((count || {}).parcels_scanned) || 0,
    results_emitted: results,
    not_evaluated_share_pct: results ? Math.round((notEvaluated / results) * 1000) / 10 : null,
    lots_total: n('lots_total'),
    population_total: n('population_total'),
    link_row_violations: Math.abs(n('lots_total') - n('population_total')) + n('lots_outside_population'),
    lineage_violations: n('array_width_violations') + n('unit_orphans') + n('text_orphans'),
    winner_evidence_violations: n('winner_evidence_violations'),
    gated_winner_violations: n('gated_winner_violations'),
    sentinel_exception_winner_violations: n('sentinel_exception_winner_violations'),
    exception_gated_lots: n('exception_gated_lots'),
    class_cap_violations: n('class_cap_violations'),
    row_sha_mismatches: mismatches,
    unreferenced_rows: n('unreferenced_units') + n('unreferenced_texts'),
    storage_mb: storage.measured_mb,
    storage_ratio: storage.ratio,
    conflict_cells: (m.not_evaluated_by_reason || {}).conflict || 0,
  };
}

// ---- checks (descriptor order; Spec 122 §5.5 (1), (4)). Every bound is declared data (limit / limit_from_config), never a comparison here (G7). ----

function parcels_scanned(ctx) { ctx.report('parcels_scanned', { violations: 0, detail: { parcels_scanned: ctx.matched.parcels_scanned, lots_resolved: ctx.matched.lots, lots_retracted: ctx.matched.lots_retracted } }); }
function link_row_violations(ctx) { ctx.report('link_row_violations', { violations: ctx.matched.link_row_violations, detail: { lots_total: ctx.matched.lots_total, population_total: ctx.matched.population_total } }); }
function lineage_violations(ctx) { ctx.report('lineage_violations', { violations: ctx.matched.lineage_violations }); }
function winner_evidence_violations(ctx) { ctx.report('winner_evidence_violations', { violations: ctx.matched.winner_evidence_violations }); }
function gated_winner_violations(ctx) { ctx.report('gated_winner_violations', { violations: ctx.matched.gated_winner_violations }); }
function sentinel_exception_winner_violations(ctx) { ctx.report('sentinel_exception_winner_violations', { violations: ctx.matched.sentinel_exception_winner_violations }); }
function conflict_cells(ctx) { ctx.report('conflict_cells', { value: ctx.matched.conflict_cells }); }
function inputs_defaulted(ctx) { ctx.report('inputs_defaulted', { violations: ctx.matched.inputs_defaulted }); }
function class_cap_violations(ctx) { ctx.report('class_cap_violations', { violations: ctx.matched.class_cap_violations }); }
function scenario_axis_cells(ctx) { ctx.report('scenario_axis_cells', { value: ctx.matched.scenario_axis_results }); }
function row_sha_mismatches(ctx) { ctx.report('row_sha_mismatches', { violations: ctx.matched.row_sha_mismatches }); }
function equivalence_disagreements(ctx) { ctx.report('equivalence_disagreements', { violations: ctx.matched.equivalence_disagreements, detail: { checked: ctx.matched.equivalence_checked } }); }
function order_disagreements(ctx) { ctx.report('order_disagreements', { violations: ctx.matched.order_disagreements, detail: { checked: ctx.matched.equivalence_checked } }); }
function equivalence_not_run(ctx) { ctx.report('equivalence_not_run', { violations: ctx.matched.lots > 0 && ctx.matched.equivalence_checked === 0 ? 1 : 0, detail: { checked: ctx.matched.equivalence_checked } }); }
function not_evaluated_share_pct(ctx) { ctx.report('not_evaluated_share_pct', { value: ctx.matched.not_evaluated_share_pct, detail: { results: ctx.matched.results_emitted, by_reason: ctx.matched.not_evaluated_by_reason } }); }
function winner_layer_histogram(ctx) { ctx.report('winner_layer_histogram', { violations: 0, detail: ctx.matched.winner_layers }); }
function unreferenced_rows(ctx) { ctx.report('unreferenced_rows', { violations: ctx.matched.unreferenced_rows }); }
function exception_gated_lots(ctx) { ctx.report('exception_gated_lots', { violations: 0, detail: { exception_gated_lots: ctx.matched.exception_gated_lots, gated_by_gate: ctx.matched.gated_by_gate } }); }
function storage_within_budget(ctx) { ctx.report('storage_within_budget', { value: ctx.matched.storage_mb, detail: { ratio: ctx.matched.storage_ratio } }); }

/** Spec 122 §5.5 (1): keys are exactly the descriptor's check ids, in declaration order. */
const CHECKS = {
  parcels_scanned,
  link_row_violations,
  lineage_violations,
  winner_evidence_violations,
  gated_winner_violations,
  sentinel_exception_winner_violations,
  conflict_cells,
  inputs_defaulted,
  class_cap_violations,
  scenario_axis_cells,
  row_sha_mismatches,
  equivalence_disagreements,
  order_disagreements,
  equivalence_not_run,
  not_evaluated_share_pct,
  winner_layer_histogram,
  unreferenced_rows,
  exception_gated_lots,
  storage_within_budget,
};

/**
 * §5.5 (1): run the SELECTED post checks over the runner-summed `ctx.matched` (the rows arm hands it over, R-EH), and return the declared
 * emits. The loop is the error boundary.
 */
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

module.exports = compute;
module.exports.compute = compute;
module.exports.checks = CHECKS;
module.exports.buildSourceSql = buildSourceSql;
module.exports.materializeRows = materializeRows;
module.exports.finalizeMatched = finalizeMatched;
module.exports.buildPostSql = buildPostSql;
module.exports.TABLES = TABLES;
module.exports.RESULT_COLUMNS = RESULT_COLUMNS;
