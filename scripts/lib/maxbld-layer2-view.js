/**
 * SPEC LINK: docs/specs/01-pipeline/134_resolve_bylaws.md §3 (the logical row shape), §4 (status sets), §10 (consumers)
 * SPEC LINK: docs/specs/01-pipeline/78_optimal_lot_configuration.md §Phase-5 D-1 (reads only Layer 2 rows), P5.3
 * Handbook:  CHAT-77.freeze (the logical row is frozen); CHAT-80.QP option 4 / Spec 124a R-JR (one lot row, the view bylaw_resolution_results);
 *            Spec 132 §core.9 (compute purity)
 *
 * THE ONE ACCESSOR. compute_maxbld_scenarios reads Layer 2 only through this view, built by ONE constructor from the lot's logical rows
 * (the shape L2-SLICES scripts/lib/bylaw-materialize.js logicalRowsOf returns, and the option-4 view bylaw_resolution_results decodes):
 *   fromLogicalRows({ lot_gate, permitted_by_class, rows: [{class, structure, target, ...result fields}] })
 * The view exposes the LOGICAL Spec 134 §3 result for (class, structure, target) plus the lot's gate and permission; extra physical columns
 * on a row are dropped, so a storage change (Q-P) cannot reach a consumer. Form C (profile pointers, cells, by_class) is gone with
 * CHAT-80.QP: there is no second constructor.
 *
 * Pure: requires nothing; no database, file, env, clock or randomness.
 *
 *   view.lotGate()                       -> the Layer 2 lot gate name, or null
 *   view.permission(cls)                 -> {status: 'permitted'|'prohibited'|'not_evaluated', clause?, reason?}
 *   view.permissionDisclosures(cls)      -> the M-169 set-aside sentences of that word (CHAT-180), [] or null on a gated lot
 *   view.result(cls, structure, target)  -> the logical result (LOGICAL_RESULT_FIELDS); a missing one THROWS (never defaulted)
 *   view.has(cls, structure, target)
 */
'use strict';

/**
 * Spec 134 §3: the logical result columns a consumer may read (identity columns excluded). FROZEN by CHAT-77.freeze (operator
 * 2026-10-22): any change to this list needs a new ruling; the physical form (Q-P) may change behind this accessor without touching Phase 3.
 * frozen-row.logic.test.ts pins it. inputs_used, losers and disclosures are recomputed on read by Layer 2 and may arrive null.
 */
const LOGICAL_RESULT_FIELDS = Object.freeze([
  'status', 'reason', 'value', 'value_kind', 'winner_unit_id', 'winner_layer', 'evidence_kind', 'evidence_ref', 'inputs_used', 'losers', 'disclosures',
]);
/** Layer 2 stored statuses (layer2-map.json `status`). */
const STATUSES = Object.freeze(['applies', 'not_applicable', 'not_evaluated']);

const keyOf = (cls, structure, target) => `${cls}\u0000${structure}\u0000${target}`;

function pick(row) {
  const out = {};
  for (const f of LOGICAL_RESULT_FIELDS) out[f] = row[f] === undefined ? null : row[f];
  if (!STATUSES.includes(out.status)) throw new TypeError(`maxbld-layer2-view: status ${JSON.stringify(out.status)} is not a Layer 2 stored status`);
  return Object.freeze(out);
}

/** The one constructor (// P3-Q1 seam, ruled CHAT-77.freeze): a lot's logical rows -> the view. */
function fromLogicalRows(src) { // P3-Q1
  const table = new Map();
  for (const r of src.rows || []) table.set(keyOf(r.class, r.structure, r.target), pick(r));
  const lotGate = src.lot_gate === undefined ? null : src.lot_gate;
  const permitted = src.permitted_by_class;
  const disclosures = src.permission_disclosures; // CHAT-180 (G5): recomputed on read by Layer 2 (logicalRowsOf); null per class on a gated lot
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
    permissionDisclosures(cls) {
      if (!disclosures || !Object.prototype.hasOwnProperty.call(disclosures, cls)) throw new Error(`maxbld-layer2-view: no permission disclosures for class ${cls}; a missing input is never defaulted`);
      return disclosures[cls];
    },
    result: get,
    has: (cls, structure, target) => table.has(keyOf(cls, structure, target)),
  });
}

module.exports = { LOGICAL_RESULT_FIELDS, FROZEN_RESULT_FIELDS: LOGICAL_RESULT_FIELDS, STATUSES, fromLogicalRows };
