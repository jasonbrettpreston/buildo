// SPEC LINK: MB-73 plan sections 3 and 4; K4b (a green certifies a committed state), K6 / FV-2 (a stale green may be re-recorded),
//            R-LG (records are written once by the tool, add-only: never rewritten, never deleted).
// Every judge returns string[] of `FAIL:R:<code>[:detail]` lines, empty = pass; a failure to decide is `FAIL:R:cannot-decide`.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { git, readAt, listTracked } from '../mcbylaws/git-util.mjs';
import { checkBound, assertSafeId } from '../mcbylaws-loop/loop-record.mjs';

export const GREEN_DIR = 'mcbylaws/promises/green/';
export const RED_DIR = 'mcbylaws/promises/red/';

const DIRS = { green: GREEN_DIR, red: RED_DIR };
const REWRITTEN = 'record-rewritten';

/** The repo-relative record path of one promise: `<green|red dir><id>.json`. */
export function recordRel(kind, id) {
  const dir = DIRS[kind];
  if (!dir) throw new Error(`bad_kind:${String(kind)}`);
  assertSafeId(id, 'promise');
  return `${dir}${id}.json`;
}

const parse = (text) => {
  if (typeof text !== 'string') return null;
  try {
    const v = JSON.parse(text);
    return typeof v === 'object' && v !== null && !Array.isArray(v) ? v : null;
  } catch {
    return null;
  }
};

/**
 * Writes one record exclusively under root and returns its relative path. The bytes go to a temp name in the SAME
 * directory, `fs.linkSync` claims the final name (EEXIST when the record exists -> `exists:<rel>`), then the temp is
 * unlinked. A record resolved outside root throws `unsafe_id:outside_root:<rel>`.
 */
export function writeExclusive(root, kind, rec) {
  const id = rec && typeof rec === 'object' ? rec.id : undefined;
  const rel = recordRel(kind, id);
  const file = path.join(root, rel);
  const fromRoot = path.relative(root, file);
  if (!fromRoot || fromRoot.startsWith('..') || path.isAbsolute(fromRoot)) throw new Error(`unsafe_id:outside_root:${rel}`);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.${crypto.randomBytes(6).toString('hex')}.tmp`;
  try {
    fs.writeFileSync(tmp, `${JSON.stringify(rec, null, 2)}\n`, { flag: 'wx' });
    fs.linkSync(tmp, file); // EEXIST when the record already exists: never rewritten
  } catch (err) {
    if (err && err.code === 'EEXIST') throw new Error(`exists:${rel}`);
    throw err;
  } finally {
    fs.rmSync(tmp, { force: true });
  }
  return rel;
}

const revOf = (revPath) => (revPath === '' ? '' : revPath);

/** `{path: blobId}` for the given paths that exist at `rev` (`''` = the index); a missing path is simply absent. */
export function blobsFor(cwd, rev, paths) {
  const out = {};
  for (const p of Array.isArray(paths) ? paths : []) {
    const r = git(cwd, ['rev-parse', `${revOf(rev)}:${p}`]);
    if (r.status === 0) out[p] = r.stdout.trim();
  }
  return out;
}

/** True when any bound input of rec differs from the tree (FV-2: the promise no longer certifies the code). */
export function isStale(rec, treeBlobs) {
  const inputs = rec && typeof rec === 'object' && rec.inputs ? rec.inputs : {};
  return checkBound({ inputs, treeBlobs }).length > 0;
}

/** `['FAIL:R:stale-green:<id>']` when stale, else []. */
export function staleLines(rec, treeBlobs) {
  return isStale(rec, treeBlobs) ? [`FAIL:R:stale-green:${rec && rec.id}`] : [];
}

/** K4b: a green certifies a committed state, so a path whose working-tree blob differs from HEAD is red. */
export function uncommittedLines(cwd, paths) {
  const out = [];
  for (const p of Array.isArray(paths) ? paths : []) {
    const wt = git(cwd, ['hash-object', '--', p]);
    const head = git(cwd, ['rev-parse', `HEAD:${p}`]);
    if (wt.status !== 0 || head.status !== 0 || wt.stdout.trim() !== head.stdout.trim()) out.push(`FAIL:R:uncommitted:${p}`);
  }
  return out;
}

/**
 * Re-records a stale green (K6), keeping its identity: a fresh record is never overwritten (`fresh:<id>`), and a new
 * record with another id or another red_of is a rewrite (`record_rewritten:<id>`). Returns the relative path.
 */
export function reRecord(root, oldRec, newRec, treeBlobs) {
  const id = oldRec && oldRec.id;
  if (!isStale(oldRec, treeBlobs)) throw new Error(`fresh:${id}`);
  if (!newRec || newRec.id !== oldRec.id || newRec.red_of !== oldRec.red_of) throw new Error(`record_rewritten:${id}`);
  fs.rmSync(path.join(root, recordRel('green', oldRec.id)), { force: true });
  return writeExclusive(root, 'green', newRec);
}

/** True when `path` is a green record that may change at `rev` because the OLD record is stale the blobs at `rev`. */
function greenReRecorded(cwd, rev, rel, oldText, newText) {
  const oldRec = parse(oldText);
  const newRec = parse(newText);
  if (!oldRec || !newRec) return false;
  if (oldRec.id !== newRec.id || oldRec.red_of !== newRec.red_of) return false;
  const inputs = oldRec.inputs && typeof oldRec.inputs === 'object' ? oldRec.inputs : {};
  return isStale(oldRec, blobsFor(cwd, rev, Object.keys(inputs)));
}

/** R-LG: every record present at `base` is present and unchanged at `rev`, except a green re-recorded while stale. */
export function addOnlyLines({ cwd, base, rev } = {}) {
  const tracked = listTracked(cwd, base);
  if (tracked === null) return ['FAIL:R:cannot-decide'];
  const out = new Set();
  for (const p of tracked) {
    const isGreen = p.startsWith(GREEN_DIR);
    const isRed = p.startsWith(RED_DIR);
    if (!isGreen && !isRed) continue;
    const oldText = readAt(cwd, base, p);
    const newText = readAt(cwd, rev, p);
    if (newText === null) {
      out.add(`FAIL:R:${REWRITTEN}:${p}`);
    } else if (newText === oldText) {
      continue;
    } else if (isGreen && greenReRecorded(cwd, rev, p, oldText, newText)) {
      continue;
    } else {
      out.add(`FAIL:R:${REWRITTEN}:${p}`);
    }
  }
  return [...out].sort();
}
