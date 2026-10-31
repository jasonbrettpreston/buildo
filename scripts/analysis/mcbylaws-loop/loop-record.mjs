// SPEC LINK: docs/specs/01-pipeline/69a_mcbylaw_register.md PR-68 / M-3xx (every round writes exactly one loop record; a record is bound by hash and never rewritten)
// SPEC LINK: ~/Buildo-scratch/mcbylaws/MB-68/plan.md section 2 (record trimmed, G68-01; binding R4-10; got_sha G68-11; add-only G68-06)
// Pure functions return string[] of violation codes (empty = green); a code with a detail is `code:detail`.
// The only disk write is writeRecordExclusive, which resolves its file relative to the repo root passed in.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export const SCHEMA = 'loop-record-v1';
export const RECORD_RE = /^docs\/reports\/loop-records\/([^/]+)\/round-(\d+)\.json$/;

const RECORD_DIR = 'docs/reports/loop-records/';
const DECISIONS = ['accept', 'revert'];
const CASE_STATUSES = ['pass', 'fail', 'accepted', 'pending'];

/**
 * The one status vocabulary of the loop (O68-01): every scorer CLASS -> the gate status `pass` | `fail`. The record, the run and any
 * report read this map and nothing else, so there is never a second spelling of a class. A class outside the map is `pending`.
 */
export const CLASS_STATUS = Object.freeze({
  MATCH: 'pass',
  ANSWERED: 'pass',
  'BY-LAW CHANGED': 'pass',
  'NOT SCORABLE': 'pass',
  DATA: 'pass',
  DIFFER: 'fail',
  'NO ANSWER': 'fail',
  'NOT MODELLED': 'fail',
  OWED: 'fail',
});

/** The gate status of one value that may already be a class (MATCH, DIFFER, ...) or a status (pass, fail, accepted, pending). PURE. */
export function statusOf(cls) {
  if (Object.prototype.hasOwnProperty.call(CLASS_STATUS, String(cls))) return CLASS_STATUS[String(cls)];
  return CASE_STATUSES.includes(cls) ? cls : 'pending';
}
const HEX64 = /^[0-9a-f]{64}$/;

// The v1 fields that are never stored (trimmed at G68-01); anything outside V1_FIELDS is an unknown field.
export const V1_FIELDS = ['schema', 'increment', 'round', 'decision', 'reason', 'accepted_findings', 'cases', 'inputs', 'binding'];
export const TRIMMED_FIELDS = [
  'floors',
  'canary',
  'counts',
  'moves',
  'groups',
  'artifacts',
  'parent_commit',
  'made_pass',
  'increment_green',
  'rounds_since_thresholds',
  'red_twins',
  'prereg_check',
];

function isObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isPositiveInteger(value) {
  return typeof value === 'number' && Number.isInteger(value) && value > 0;
}

/** Canonical JSON: recursively sorted object keys, arrays in order, no whitespace, undefined dropped. */
export function canon(value) {
  if (Array.isArray(value)) return `[${value.map((item) => canon(item === undefined ? null : item)).join(',')}]`;
  if (isObject(value)) {
    const keys = Object.keys(value).filter((key) => value[key] !== undefined).sort();
    return `{${keys.map((key) => `${JSON.stringify(key)}:${canon(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value === undefined ? null : value);
}

/** Hex sha256 of a string (utf8) or, for anything else, of its canonical JSON. */
export function sha256(value) {
  const text = typeof value === 'string' ? value : canon(value);
  return crypto.createHash('sha256').update(text, 'utf8').digest('hex');
}

/** The got_sha of one observed value (G68-11): a missing member is a written null. */
export function gotSha({ status, value, reason } = {}) {
  const member = (x) => (x === undefined ? null : x);
  return sha256({ reason: member(reason), status: member(status), value: member(value) });
}

/**
 * The one id form a record path may hold (O68-14): letters, digits, `.`, `_` and `-`, and never `.` or `..` alone. An increment or
 * a round id outside it would escape docs/reports/loop-records (a `../../escape` writes outside the root), so it throws.
 */
export const SAFE_ID_RE = /^[A-Za-z0-9._-]+$/;

export function assertSafeId(id, label = 'id') {
  if (typeof id !== 'string' || !SAFE_ID_RE.test(id) || id === '.' || id === '..') {
    throw new Error(`unsafe_id:${label}:${String(id)}`);
  }
  return id;
}

/** docs/reports/loop-records/<increment>/round-<nn>.json. Throws `unsafe_id:` for an increment or a round id outside SAFE_ID_RE (O68-14). */
export function recordPath(increment, n) {
  assertSafeId(increment, 'increment');
  assertSafeId(String(n), 'round');
  return `${RECORD_DIR}${increment}/round-${String(n).padStart(2, '0')}.json`;
}

/** The next round number of one increment: max existing round (numeric) + 1, or 1. */
export function nextRound(existingPaths, increment) {
  let max = 0;
  for (const p of existingPaths) {
    const m = RECORD_RE.exec(p);
    if (!m || m[1] !== increment) continue;
    const n = parseInt(m[2], 10);
    if (Number.isFinite(n) && n > max) max = n;
  }
  return max + 1;
}

/** Copy of the record with binding.sha256 = sha256(canon of the record without binding). */
export function bindRecord(rec) {
  const rest = { ...rec };
  delete rest.binding;
  return { ...rest, binding: { sha256: sha256(canon(rest)) } };
}

function checkCases(cases) {
  if (!Array.isArray(cases)) return false;
  return cases.every(
    (c) =>
      isObject(c) &&
      typeof c.id === 'string' &&
      CASE_STATUSES.includes(c.status) &&
      typeof c.got_sha === 'string' &&
      HEX64.test(c.got_sha),
  );
}

/** Shape + binding of one record; empty = green. */
export function checkRecordShape(rec) {
  const out = [];
  const r = isObject(rec) ? rec : {};
  if (r.schema !== SCHEMA) out.push('record_shape:schema');
  if (typeof r.increment !== 'string') out.push('record_shape:increment');
  if (!isPositiveInteger(r.round)) out.push('record_shape:round');
  if (!DECISIONS.includes(r.decision)) out.push('record_shape:decision');
  if (typeof r.reason !== 'string') out.push('record_shape:reason');
  if (!Array.isArray(r.accepted_findings) || !r.accepted_findings.every((f) => isObject(f))) {
    out.push('record_shape:accepted_findings');
  }
  if (!checkCases(r.cases)) out.push('record_shape:cases');
  if (!isObject(r.inputs) || !Object.values(r.inputs).every((v) => typeof v === 'string')) {
    out.push('record_shape:inputs');
  }
  for (const key of Object.keys(r)) {
    if (!V1_FIELDS.includes(key)) out.push(`record_shape:unknown_field:${key}`);
  }
  const bound = isObject(r.binding) && typeof r.binding.sha256 === 'string' ? r.binding.sha256 : null;
  if (bound === null || bound !== sha256(canon(recordWithoutBinding(r)))) out.push('record_binding_mismatch');
  return out;
}

function recordWithoutBinding(rec) {
  const rest = { ...rec };
  delete rest.binding;
  return rest;
}

/**
 * A bound input that is NOT a git path (O68-02): the `data:<group>` content hashes and the `pin / <group> / <key>` scorer pin values a
 * `run --write` stores. They have no blob to compare; the run recomputes them (inputsFresh) and the gate compares the values instead.
 */
export const LIVE_INPUT_RE = /^(data:|pin \/ )/;

/**
 * Every bound input must be in the record and unchanged in a tree. `treeBlobs` is the tree the round was
 * accepted on (the authoritative one), so every bound input is judged against it; `changedBound` (default:
 * all bound inputs) only widens the set with unbound paths changed since, which are `input_not_bound:<p>`.
 * Only GIT paths are judged (O68-02): a `data:` / `pin / ` input has no blob, so it is skipped here (the gate
 * compares its recomputed value through the run's `inputsFresh`).
 */
export function checkBound({ inputs = {}, treeBlobs = {}, changedBound = null } = {}) {
  const out = [];
  const paths = Object.keys(inputs).filter((p) => Object.prototype.hasOwnProperty.call(inputs, p));
  for (const p of Array.isArray(changedBound) ? changedBound : []) {
    if (!paths.includes(p)) paths.push(p);
  }
  for (const p of paths) {
    if (LIVE_INPUT_RE.test(p)) continue;
    if (!Object.prototype.hasOwnProperty.call(inputs, p)) {
      out.push(`input_not_bound:${p}`);
    } else if (!Object.prototype.hasOwnProperty.call(treeBlobs, p) || treeBlobs[p] !== inputs[p]) {
      out.push(`stale_green:${p}`);
    }
  }
  return out;
}

/** A record is added, never modified or deleted (G68-06). */
export function checkRecordsAddOnly(nameStatus = []) {
  const out = [];
  for (const row of nameStatus) {
    if (row && typeof row.p === 'string' && row.p.startsWith(RECORD_DIR) && row.s !== 'A') {
      out.push(`record_modified_or_deleted:${row.p}`);
    }
  }
  return out;
}

/**
 * Writes the record exclusively under root and returns its relative path.
 * O68-21: the bytes go to a temp name in the SAME directory (a rename across filesystems is not atomic), then `fs.linkSync` claims the
 * round name (link fails with EEXIST when the round exists, so the add-only door is unchanged), then the temp is unlinked: a reader never
 * sees a zero-length round-NN.json. O68-14: the resolved file must stay under root (`path.relative`) or this throws.
 */
export function writeRecordExclusive(root, rec) {
  const rel = recordPath(rec.increment, rec.round);
  const file = path.join(root, rel);
  const fromRoot = path.relative(root, file);
  if (!fromRoot || fromRoot.startsWith('..') || path.isAbsolute(fromRoot)) throw new Error(`unsafe_id:outside_root:${rel}`);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.${crypto.randomBytes(6).toString('hex')}.tmp`;
  try {
    fs.writeFileSync(tmp, `${JSON.stringify(rec, null, 2)}\n`, { flag: 'wx' });
    fs.linkSync(tmp, file); // EEXIST when the round already exists: the record is never rewritten
  } finally {
    fs.rmSync(tmp, { force: true }); // never leave the temp behind, on the link error path too
  }
  return rel;
}
