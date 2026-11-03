// SPEC LINK: docs/specs/01-pipeline/69a_mcbylaw_register.md M-72, M-377 (MB-31 Layer 3 step; plan section 5 read 1 and 2)
// MB-31 B6: decode bylaw_resolution_results / bylaw_resolution_lots into Layer 3 cells (plan section 5, read 1 and 2).
'use strict';

// the frozen logical row a stored cell can carry (the four layer 2 status words)
const STATUSES = ['applies', 'not_applicable', 'not_evaluated', 'conflict'];
const KINDS = ['number', 'unlimited', 'unregulated'];
const PCT_SUFFIX = '_pct';
const MALFORMED_REASON = 'condition_unknown:cell_malformed';
const NOT_EVALUATED = 'not_evaluated';

function inList(list, x) {
  return list.indexOf(x) !== -1;
}

function isFiniteNumber(x) {
  return typeof x === 'number' && isFinite(x);
}

// E31-26: a stored cell outside the frozen shape becomes not_evaluated, never a silent value
function isMalformed(row) {
  if (!row || typeof row !== 'object') return true;
  const s = row.status;
  if (!inList(STATUSES, s)) return true;
  if (s !== 'applies') return false;
  const kind = row.value_kind;
  if (!inList(KINDS, kind)) return true;
  if (kind === 'number') {
    const v = row.value;
    if (!isFiniteNumber(v)) return true;
    if (v < 0) return true;
    const target = typeof row.target === 'string' ? row.target : '';
    if (target.slice(target.length - PCT_SUFFIX.length) === PCT_SUFFIX && v > 100) return true;
    return false;
  }
  return row.value !== null && row.value !== undefined;
}

function malformedCell() {
  return { s: NOT_EVALUATED, kind: null, value: null, clause: null, reason: MALFORMED_REASON };
}

function decodeOne(row) {
  const clause = row.winner_unit_id === undefined ? null : row.winner_unit_id;
  const reason = row.reason === undefined ? null : row.reason;
  if (isMalformed(row)) return malformedCell();
  const kind = row.value_kind === undefined ? null : row.value_kind;
  const value = row.status === 'applies' && kind === 'number' ? row.value : null;
  return { s: row.status, kind, value, clause, reason };
}

// rows of the view bylaw_resolution_results -> one cell per target of this class and structure
function decodeCells(viewRows, cls, structure) {
  const list = Array.isArray(viewRows) ? viewRows : [];
  const cells = {};
  let malformed = 0;
  for (let i = 0; i < list.length; i += 1) {
    const row = list[i];
    if (!row || row.class !== cls || row.structure !== structure) continue;
    const target = row.target;
    if (Object.prototype.hasOwnProperty.call(cells, target)) {
      throw new Error('duplicate cell for target: ' + String(target));
    }
    const cell = decodeOne(row);
    if (cell.s === NOT_EVALUATED && cell.reason === MALFORMED_REASON) malformed += 1;
    cells[target] = cell;
  }
  return { cells, malformed };
}

// the lot row -> the permission code of one bylaw class (plan section 5, read 2)
function decodePermission(lotRow, cls, opts) {
  const o = opts || {};
  const classes = Array.isArray(o.classes) ? o.classes : [];
  const permissionKeys = o.permissionKeys || {};
  const texts = o.texts || {};
  const i = classes.indexOf(cls);
  if (i === -1) throw new Error('unknown class: ' + String(cls));
  const permitted = Array.isArray(lotRow.permitted) ? lotRow.permitted : [];
  const code = permitted[i];
  if (!Object.prototype.hasOwnProperty.call(permissionKeys, String(code))) {
    throw new Error('unknown permission code: ' + String(code));
  }
  const ids = Array.isArray(lotRow.permitted_text_ids) ? lotRow.permitted_text_ids : [];
  const textId = ids[i];
  const text = textId === null || textId === undefined ? null : texts[String(textId)];
  const key = permissionKeys[String(code)];
  return {
    code,
    gate: lotRow.lot_gate === undefined ? null : lotRow.lot_gate,
    clause: key === 'prohibited' ? (text === undefined ? null : text) : null,
    reason: key === 'not_evaluated' ? (text === undefined ? null : text) : null,
  };
}

module.exports = { decodeCells, decodePermission, isMalformed };
