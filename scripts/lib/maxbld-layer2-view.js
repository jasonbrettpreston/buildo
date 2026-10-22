/**
 * SPEC LINK: docs/specs/01-pipeline/134_resolve_bylaws.md §3 (the logical row shape), §4 (status sets), §10 (consumers)
 * SPEC LINK: docs/specs/01-pipeline/78_optimal_lot_configuration.md §Phase-5 D-1 (reads only Layer 2 rows), P5.3
 * Handbook:  form C (CHAT-69.Q1; recorded at bc5cd3af, not yet on this branch), Spec 132 §core.9 (compute purity); HELD on P3-Q1 (N6a freeze, operator ruling pending)
 *
 * THE ONE ACCESSOR (P3-Q1). compute_maxbld_scenarios reads Layer 2 only through this view. The view exposes the LOGICAL
 * Spec 134 §3 result for (class, structure, target) plus the lot's gate and permission; it is the only code that knows how
 * those rows are stored. Two constructors build it:
 *   fromLogicalRows(src)  the fixture form: one flat row per (class, structure, target).
 *   fromCellRows(src)     the stored form C (R-JA): the lot's entries -> cell rows, with `by_class` resolved here
 *                         (the representative class's columns, other classes as columns or `collapsed_into:<class>`).
 * The pointer unpacking of the profile bytea (packPointers / unpackPointers, L2-SLICES part A) stays outside: the caller
 * passes the lot's entries [{structure, target, cell_id}] it read. When the physical form changes, only this file changes.
 *
 * Pure: requires nothing; no database, file, env, clock or randomness.
 *
 *   view.lotGate()                       -> the Layer 2 lot gate name, or null
 *   view.permission(cls)                 -> {status: 'permitted'|'prohibited'|'not_evaluated', clause?, reason?}
 *   view.result(cls, structure, target)  -> the logical result (LOGICAL_RESULT_FIELDS); a missing one THROWS (never defaulted)
 *   view.has(cls, structure, target)
 */
'use strict';

/** Spec 134 §3 / R-JA: the logical result columns a consumer may read (identity columns excluded). */
const LOGICAL_RESULT_FIELDS = Object.freeze([
  'status', 'reason', 'value', 'value_kind', 'winner_unit_id', 'winner_layer', 'evidence_kind', 'evidence_ref', 'inputs_used', 'losers', 'disclosures',
]);
/** Layer 2 stored statuses (layer2-map.json `status`). */
const STATUSES = Object.freeze(['applies', 'not_applicable', 'not_evaluated']);
const COLLAPSED = 'collapsed_into:';

const keyOf = (cls, structure, target) => `${cls}\u0000${structure}\u0000${target}`;

function pick(row) {
  const out = {};
  for (const f of LOGICAL_RESULT_FIELDS) out[f] = row[f] === undefined ? null : row[f];
  if (!STATUSES.includes(out.status)) throw new TypeError(`maxbld-layer2-view: status ${JSON.stringify(out.status)} is not a Layer 2 stored status`);
  return Object.freeze(out);
}

function makeView(lotGate, permitted, table) {
  const get = (cls, structure, target) => {
    const k = keyOf(cls, structure, target);
    if (!table.has(k)) throw new Error(`maxbld-layer2-view: no Layer 2 result for ${cls}/${structure}/${target}; a missing input is never defaulted (Spec 134 I10)`);
    return table.get(k);
  };
  return Object.freeze({
    lotGate: () => lotGate,
    permission(cls) {
      if (!permitted || !Object.prototype.hasOwnProperty.call(permitted, cls)) throw new Error(`maxbld-layer2-view: no permission for class ${cls}; a missing input is never defaulted`);
      return permitted[cls];
    },
    result: get,
    has: (cls, structure, target) => table.has(keyOf(cls, structure, target)),
  });
}

/** Fixture form: { lot_gate, permitted_by_class, rows: [{class, structure, target, ...result fields}] }. */
function fromLogicalRows(src) { // P3-Q1
  const table = new Map();
  for (const r of src.rows || []) table.set(keyOf(r.class, r.structure, r.target), pick(r));
  return makeView(src.lot_gate === undefined ? null : src.lot_gate, src.permitted_by_class, table);
}

/**
 * Stored form C: { lot: {lot_gate, permitted_by_class}, classes: [representative first], entries: [{structure, target, cell_id}],
 * cellsById: {cell_id: cell row with by_class} }. A non-representative class reads `by_class[cls]`: its own columns, or
 * `collapsed_into:<class>` -> that class's result (R-IR).
 */
function fromCellRows(src) { // P3-Q1
  const classes = src.classes;
  if (!Array.isArray(classes) || classes.length === 0) throw new TypeError('maxbld-layer2-view: classes (representative first) is required');
  const rep = classes[0];
  const table = new Map();
  for (const e of src.entries || []) {
    const cell = src.cellsById[e.cell_id];
    if (!cell) throw new Error(`maxbld-layer2-view: cell ${e.cell_id} is not in cellsById (a missing input is never defaulted)`);
    const resolve = (cls, depth) => {
      if (cls === rep) return cell;
      const b = cell.by_class ? cell.by_class[cls] : undefined;
      if (b === undefined) throw new Error(`maxbld-layer2-view: cell ${e.cell_id} has no by_class entry for ${cls}`);
      if (typeof b === 'string') {
        if (!b.startsWith(COLLAPSED) || depth > classes.length) throw new Error(`maxbld-layer2-view: bad by_class entry ${JSON.stringify(b)} for ${cls}`);
        return resolve(b.slice(COLLAPSED.length), depth + 1);
      }
      return { ...cell, ...b, inputs_used: cell.inputs_used };
    };
    for (const cls of classes) table.set(keyOf(cls, e.structure, e.target), pick(resolve(cls, 0)));
  }
  return makeView(src.lot.lot_gate === undefined ? null : src.lot.lot_gate, src.lot.permitted_by_class, table);
}

module.exports = { LOGICAL_RESULT_FIELDS, STATUSES, fromLogicalRows, fromCellRows };
