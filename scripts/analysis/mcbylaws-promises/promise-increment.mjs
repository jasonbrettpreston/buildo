// SPEC LINK: MB-73 plan section 6 "Increment scope derived inside the checker" (K7); R-KU (the increment
//            scope is read from the register row, not declared by the author); R-BF (a red in an in-scope
//            row sinks the increment); R3-02 / R4-08 (untraced promise numbers), F-IDS, F-N0, F-P7.
// Every judge returns string[] (`FAIL:<ARM>:<code>[:<detail>]`, empty = pass); an undecidable case fails closed.
import { readAt, listTracked } from '../mcbylaws/git-util.mjs';
import { RECORD_RE, checkRecordShape } from '../mcbylaws-loop/loop-record.mjs';

export const INCREMENTS_PATH = 'scripts/analysis/mcbylaws-loop/data/increments.json';

/** The increment list at `rev`: `{ids, lines}`; anything but a non-empty array of non-empty strings fails closed. */
export function readIncrementIds(cwd, rev) {
  const text = readAt(cwd, rev, INCREMENTS_PATH);
  if (text === null) return { ids: [], lines: ['FAIL:R:cannot-decide:increment-ids'] };
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ids: [], lines: ['FAIL:R:cannot-decide:increment-ids'] };
  }
  const ids = parsed && typeof parsed === 'object' ? parsed.ids : undefined;
  const good = Array.isArray(ids) && ids.length > 0 && ids.every((id) => typeof id === 'string' && id !== '');
  return good ? { ids, lines: [] } : { ids: [], lines: ['FAIL:R:cannot-decide:increment-ids'] };
}

/** The accepted loop records at `rev` as `{path, increment, round}`: `{records, lines}`. A record that cannot be read, parsed or validated fails the whole call. */
export function recordsAt({ cwd, rev } = {}) {
  const tracked = listTracked(cwd, rev);
  if (tracked === null) return { records: [], lines: ['FAIL:R:cannot-decide:records'] };
  const records = [];
  for (const path of tracked) {
    const m = RECORD_RE.exec(path);
    if (!m) continue;
    const text = readAt(cwd, rev, path);
    let rec;
    try {
      rec = text === null ? null : JSON.parse(text);
    } catch {
      return { records: [], lines: [`FAIL:R:cannot-decide:record:${path}`] };
    }
    if (rec === null || checkRecordShape(rec).length > 0) return { records: [], lines: [`FAIL:R:cannot-decide:record:${path}`] };
    if (rec.decision !== 'accept') continue;
    records.push({ path, increment: m[1], round: parseInt(m[2], 10) });
  }
  return { records, lines: [] };
}

/** The next increment N: the accepted increment with the highest INDEX in `ids` (never a numeric maximum). `{n, lines}`. */
export function derivedN(records, ids) {
  let best = -1;
  for (const rec of records) {
    const i = ids.indexOf(rec.increment);
    if (i < 0) return { n: null, lines: [`FAIL:R:cannot-decide:increment-unknown:${rec.increment}`] };
    if (i > best) best = i;
  }
  return { n: best < 0 ? null : ids[best], lines: [] };
}

/** True when the row is in scope at N: a null row increment is always in scope, else index order. */
export function inScope(row, n, ids) {
  if (row.increment === null || row.increment === undefined) return true;
  if (n === null) return false;
  const i = ids.indexOf(row.increment);
  return i >= 0 && i <= ids.indexOf(n);
}

/** Rows whose increment is not in the list, sorted by id. */
export function scopeLines(rows, ids) {
  return rows
    .filter((row) => row.increment !== null && row.increment !== undefined && !ids.includes(row.increment))
    .map((row) => String(row.id))
    .sort()
    .map((id) => `FAIL:R:cannot-decide:row-increment-unknown:${id}`);
}

/** The `--increment` argument against the derived N: unknown, mismatch or equal. */
export function checkIncrementArg(arg, n, ids) {
  if (arg === undefined || arg === null) return [];
  if (!ids.includes(arg)) return [`FAIL:R:cannot-decide:increment-unknown:${arg}`];
  if (arg !== n) return [`FAIL:R:cannot-decide:increment-mismatch:${arg}:${n}`];
  return [];
}

/** R-BF: every in-scope row must be done, else the increment is green with red. Sorted by id; N null -> []. */
export function incrementLines({ rows, states, n, ids } = {}) {
  if (n === null) return [];
  return rows
    .filter((row) => inScope(row, n, ids) && (states || {})[row.id] !== 'done')
    .map((row) => String(row.id))
    .sort()
    .map((id) => `FAIL:R:increment-green-with-red:${id}`);
}

/** R3-02 / R4-08: a promise number is untraced when ANY of phase2_row_id, catalogue_row, setting is missing or empty. */
export function untracedLines(resultRows) {
  const nonEmpty = (v) => typeof v === 'string' && v.trim() !== '';
  return resultRows
    .filter((row) => {
      const trace = row.trace && typeof row.trace === 'object' ? row.trace : {};
      return !(nonEmpty(trace.phase2_row_id) && nonEmpty(trace.catalogue_row) && nonEmpty(trace.setting));
    })
    .map((row) => String(row.id))
    .sort()
    .map((id) => `FAIL:W:untraced-number:${id}`);
}
