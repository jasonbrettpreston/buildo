// SPEC LINK: MB-73 plan §2.4, §2.5 and §3; K1c, K18, PR-73-2 — the artifact map is DECLARED data: one entry per
//            row id, never a scope. R-KQ (a row needs an artifact), R-KU (an id never vanishes), FV-3 (identity).
//
// Every way the join can fail to decide returns a `FAIL:R:` line; a missing entry is never a pass.

import { pathExistsAt, listTracked, readAt } from '../mcbylaws/git-util.mjs';
import { canon, sha256 } from '../mcbylaws-loop/loop-record.mjs';
import { sourceClosure } from './promise-sources.mjs';
import { extractRows } from './promise-ids.mjs';

/** The committed artifact map. */
export const ARTIFACTS_PATH = 'mcbylaws/promises/artifacts.json';

const GREEN = 'mcbylaws/promises/green/';
const RED = 'mcbylaws/promises/red/';
const CANNOT_DECIDE = 'FAIL:R:cannot-decide:artifacts-json';

const isObject = (v) => typeof v === 'object' && v !== null && !Array.isArray(v);
const nonEmpty = (v) => typeof v === 'string' && v !== '';

/**
 * The source closure at `rev`, its lines, and the rows extracted from it.
 * @param {{cwd: string, rev: string, incIds?: string[]}} opts
 * @returns {{rows: object[], files: object[], lines: string[]}}
 */
export function buildRegister({ cwd, rev, incIds = [] }) {
  const { files, lines } = sourceClosure({ cwd, rev });
  return { rows: extractRows(files, incIds), files, lines };
}

/** True when `entry` is an artifact-map entry: an object with non-empty string `artifact` and `test_name`. */
const validEntry = (e) => isObject(e) && nonEmpty(e.artifact) && nonEmpty(e.test_name);

/**
 * The declared artifact map at `rev`. Absent = the bootstrap (`{}`, no lines); unreadable or malformed = cannot-decide.
 * An `increment` key is NOT a read error here (judged in `joinArtifacts`).
 * @param {string} cwd
 * @param {string} rev
 * @returns {{artifacts: object, lines: string[]}}
 */
export function readArtifacts(cwd, rev) {
  if (!pathExistsAt(cwd, rev, ARTIFACTS_PATH)) return { artifacts: {}, lines: [] };
  const text = readAt(cwd, rev, ARTIFACTS_PATH);
  if (text === null) return { artifacts: {}, lines: [CANNOT_DECIDE] };
  let parsed;
  try { parsed = JSON.parse(text); } catch { return { artifacts: {}, lines: [CANNOT_DECIDE] }; }
  if (!isObject(parsed)) return { artifacts: {}, lines: [CANNOT_DECIDE] };
  for (const value of Object.values(parsed)) if (!validEntry(value)) return { artifacts: {}, lines: [CANNOT_DECIDE] };
  return { artifacts: parsed, lines: [] };
}

/** True when `artifact` is absolute, climbs with `..`, or is not a file tracked at `rev`. */
const missingArtifact = (cwd, rev, artifact) => {
  if (artifact.startsWith('/') || artifact.split('/').includes('..')) return true;
  return !pathExistsAt(cwd, rev, artifact);
};

/**
 * The join of the rows with the declared map, in order: scope keys first (K18), then the rows in row order.
 * @param {{rows: object[], artifacts: object, cwd: string, rev: string}} opts
 * @returns {string[]}
 */
export function joinArtifacts({ rows, artifacts, cwd, rev }) {
  const map = isObject(artifacts) ? artifacts : {};
  const lines = [];
  for (const id of Object.keys(map).sort()) {
    if (Object.prototype.hasOwnProperty.call(map[id], 'increment')) lines.push(`FAIL:R:scope-key:${id}`);
  }
  for (const row of rows || []) {
    const entry = Object.prototype.hasOwnProperty.call(map, row.id) ? map[row.id] : null;
    if (entry === null) { lines.push(`FAIL:R:no-artifact:${row.id}`); continue; }
    if (!validEntry(entry) || missingArtifact(cwd, rev, entry.artifact)) lines.push(`FAIL:R:artifact-missing:${row.id}`);
  }
  return lines;
}

/**
 * Every id known at `rev`: the declared map's keys plus `green/<id>.json` and `red/<id>.json`. `null` = unreadable.
 * @param {string} cwd
 * @param {string} rev
 * @returns {Set<string>|null}
 */
export function idsAt(cwd, rev) {
  const trackedList = listTracked(cwd, rev);
  if (trackedList === null) return null;
  const ids = new Set(Object.keys(readArtifacts(cwd, rev).artifacts));
  for (const path of trackedList) {
    for (const prefix of [GREEN, RED]) {
      if (path.startsWith(prefix) && path.endsWith('.json') && path.length > prefix.length + 5) {
        ids.add(path.slice(prefix.length, -5));
      }
    }
  }
  return ids;
}

/**
 * K1c: every id of the base that no current row carries.
 * @param {{baseIds: Set<string>, rows: object[]}} opts
 * @returns {string[]}
 */
export function vanishedLines({ baseIds, rows }) {
  const live = new Set((rows || []).map((r) => r.id));
  return [...(baseIds || new Set())].filter((id) => !live.has(id)).sort()
    .map((id) => `FAIL:R:id-vanished:${id}`);
}

/**
 * FV-3: the identity of one promise — the row's id, file, quoted_line and the entry's artifact and test_name only.
 * @param {object} row
 * @param {object} entry
 * @returns {string}
 */
export function identityHash(row, entry) {
  const pick = (v) => (v === undefined ? null : v);
  return sha256(canon({
    id: pick(row?.id), file: pick(row?.file), quoted_line: pick(row?.quoted_line),
    artifact: pick(entry?.artifact), test_name: pick(entry?.test_name),
  }));
}

/**
 * The register hash: sha256 of the sorted identities (a row with no entry hashes its nulls).
 * @param {object[]} rows
 * @param {object} artifacts
 * @returns {string}
 */
export function registerHash(rows, artifacts) {
  const map = isObject(artifacts) ? artifacts : {};
  const hashes = (rows || []).map((row) => identityHash(
    row, Object.prototype.hasOwnProperty.call(map, row.id) ? map[row.id] : { artifact: null, test_name: null },
  )).sort();
  return sha256(canon(hashes));
}
