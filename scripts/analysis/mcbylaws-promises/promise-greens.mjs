// SPEC LINK: MB-73 plan sections 3 and 4; K4a (red first), K-1 (a green must bind its artifact as an input),
//            K6 / FV-2 (a green bound to blobs, stale once they move) and K-6 (the red's binding is judged too),
//            R-LG (a record is never rewritten), R-KQ / R-KU (a row needs a green).
// Every judge returns string[] of `FAIL:R:<code>[:detail]` lines, empty = pass; a failure to decide is `FAIL:R:cannot-decide`.
import { readAt } from '../mcbylaws/git-util.mjs';
import { bindRecord } from '../mcbylaws-loop/loop-record.mjs';
import { GREEN_DIR, RED_DIR, recordRel, blobsFor, staleLines } from './promise-record.mjs';
import { identityHash } from './promise-register.mjs';
import { runLines } from './promise-run.mjs';

const isObject = (v) => typeof v === 'object' && v !== null && !Array.isArray(v);
const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);

/**
 * Reads one record at `rev`: `{rec, line}`; absent -> both null; unparseable or non-object -> cannot-decide.
 * @param {string} cwd
 * @param {string} rev
 * @param {'green'|'red'} kind
 * @param {string} id
 * @returns {{rec: object|null, line: string|null}}
 */
export function readRecord(cwd, rev, kind, id) {
  const rel = recordRel(kind, id);
  const text = readAt(cwd, rev, rel);
  if (text === null) return { rec: null, line: null };
  let rec;
  try {
    rec = JSON.parse(text);
  } catch {
    return { rec: null, line: `FAIL:R:cannot-decide:record:${rel}` };
  }
  if (!isObject(rec)) return { rec: null, line: `FAIL:R:cannot-decide:record:${rel}` };
  return { rec, line: null };
}

/** K6 / R-LG: the record carries a binding that its own content no longer produces (a missing binding counts). */
const rewritten = (rec) => bindRecord(rec).binding.sha256 !== (rec.binding && rec.binding.sha256);

/**
 * The problems of one row's green, in order: the green's binding, the red's binding, red-first, staleness, the run.
 * @param {{cwd: string, rev: string, row: object, entry: object, green: object, red: object|null, match: object}} o
 * @returns {string[]}
 */
function greenProblems({ cwd, rev, row, entry, green, red, match }) {
  const id = row.id;
  const out = [];
  if (rewritten(green)) out.push(`FAIL:R:record-rewritten:${recordRel('green', id)}`);
  if (red && rewritten(red)) out.push(`FAIL:R:record-rewritten:${recordRel('red', id)}`);
  if (
    !red ||
    green.red_of !== red.artifact_blob ||
    red.artifact !== entry.artifact ||
    red.test_name !== entry.test_name
  ) {
    out.push(`FAIL:R:no-red-first:${id}`);
  }
  const inputs = isObject(green.inputs) ? green.inputs : {};
  const treeBlobs = blobsFor(cwd, rev, [entry.artifact, ...Object.keys(inputs)]);
  const stale = staleLines(green, treeBlobs);
  // K-1: a green that does not bind its artifact as an input certifies nothing about the code.
  const unbound = !own(inputs, entry.artifact);
  const moved = green.artifact_blob !== treeBlobs[entry.artifact] || green.identity_sha !== identityHash(row, entry);
  if (stale.length > 0 || unbound || moved) out.push(`FAIL:R:stale-green:${id}`);
  for (const line of runLines({ [id]: match })) out.push(line);
  return out;
}

/**
 * Judges every row's green: `{lines, states}` where a state is `done` | `not yet` | `red`.
 * @param {{cwd: string, rev: string, rows: object[], artifacts: object, matches: object}} opts
 * @returns {{lines: string[], states: object}}
 */
export function greenLines({ cwd, rev, rows, artifacts, matches }) {
  const map = isObject(artifacts) ? artifacts : {};
  const lines = [];
  const states = {};
  const sorted = [...(rows || [])].filter((r) => r && typeof r.id === 'string').sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const push = (line) => {
    if (!lines.includes(line)) lines.push(line);
  };
  for (const row of sorted) {
    const id = row.id;
    const has = own(map, id);
    const entry = has ? map[id] : null;
    if (!has || !isObject(entry)) {
      states[id] = 'red';
      continue;
    }
    const green = readRecord(cwd, rev, 'green', id);
    const red = readRecord(cwd, rev, 'red', id);
    if (green.line) push(green.line);
    if (red.line) push(red.line);
    if (green.line || red.line) {
      states[id] = 'red';
      continue;
    }
    if (!green.rec) {
      push(`FAIL:R:not-green:${id}`);
      states[id] = red.rec ? 'not yet' : 'red';
      continue;
    }
    const match = (matches && matches[id]) || { state: 'missing' };
    const problems = greenProblems({ cwd, rev, row, entry, green: green.rec, red: red.rec, match });
    for (const line of problems) push(line);
    states[id] = problems.length === 0 ? 'done' : 'red';
  }
  return { lines, states };
}

export { GREEN_DIR, RED_DIR };
