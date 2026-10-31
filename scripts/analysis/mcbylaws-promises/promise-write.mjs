// SPEC LINK: MB-73 plan sections 3 and 4; R-KQ (a row needs a green), R-KU, R-LG (records are written once),
//            K4b (a green certifies a committed state), K6 / FV-2 (a stale green is re-recorded with its red_of kept).
// Both writers throw `Error('<code>:<id>[:<detail>]')` on a refusal; the CLI turns that into exit 2. Never overwrite.
import { git } from '../mcbylaws/git-util.mjs';
import { bindRecord } from '../mcbylaws-loop/loop-record.mjs';
import { writeExclusive, blobsFor, isStale, reRecord, uncommittedLines } from './promise-record.mjs';
import { identityHash } from './promise-register.mjs';
import { runVitest, matchTests } from './promise-run.mjs';
import { closureOf, blobsOf } from './promise-closure.mjs';
import { readRecord } from './promise-greens.mjs';

/** The run counters of one vitest JSON, 0 when absent. */
const runCounts = (json) => ({
  passed: json.numPassedTests || 0,
  failed: json.numFailedTests || 0,
  skipped: json.numPendingTests || 0,
  total: json.numTotalTests || 0,
});

/**
 * The HEAD sha of `cwd`; `no-head` when it cannot be read.
 * @param {string} cwd
 * @returns {string}
 */
export function gitHead(cwd) {
  const r = git(cwd, ['rev-parse', 'HEAD']);
  const sha = r.status === 0 ? r.stdout.trim() : '';
  if (!/^[0-9a-f]{40,64}$/.test(sha)) throw new Error('no-head');
  return sha;
}

/** The work-tree blob of `path` (what the red observed); `no-blob:<id>` when git cannot hash it. */
const workTreeBlob = (cwd, path, id) => {
  const r = git(cwd, ['hash-object', '--', path]);
  const sha = r.status === 0 ? r.stdout.trim() : '';
  if (sha === '') throw new Error(`no-blob:${id}:${path}`);
  return sha;
};

/**
 * Runs the artifact and writes the red record: ONLY a `failed` test is a red. Returns the relative path.
 * @param {{cwd: string, id: string, entry: object, runner?: Function}} args
 * @returns {string}
 */
export function writeRed({ cwd, id, entry, runner = runVitest }) {
  const res = runner({ cwd, files: [entry.artifact] });
  if (!res || res.ok !== true) throw new Error(`run-failed:${id}:${(res && res.reason) || 'unknown'}`);
  const match = matchTests(res.json, [{ id, artifact: entry.artifact, test_name: entry.test_name }])[id];
  const state = match ? match.state : 'missing';
  if (state === 'passed') throw new Error(`not-red:${id}`);
  if (state !== 'failed') throw new Error(`not-red:${id}:${state}`);
  const rec = bindRecord({
    schema: 'promise-red-v1', id, artifact: entry.artifact, test_name: entry.test_name,
    artifact_blob: workTreeBlob(cwd, entry.artifact, id), commit: gitHead(cwd), run: runCounts(res.json),
  });
  return writeExclusive(cwd, 'red', rec);
}

/**
 * Runs the artifact and writes (or re-records a stale) green. Returns the relative path.
 * @param {{cwd: string, id: string, row: object, entry: object, runner?: Function}} args
 * @returns {string}
 */
export function writeGreen({ cwd, id, row, entry, runner = runVitest }) {
  const red = readRecord(cwd, 'HEAD', 'red', id);
  if (red.line) throw new Error(red.line);
  if (!red.rec) throw new Error(`no-red-first:${id}`);
  const res = runner({ cwd, files: [entry.artifact] });
  if (!res || res.ok !== true) throw new Error(`run-failed:${id}:${(res && res.reason) || 'unknown'}`);
  const match = matchTests(res.json, [{ id, artifact: entry.artifact, test_name: entry.test_name }])[id];
  const state = match ? match.state : 'missing';
  if (state !== 'passed') throw new Error(`not-green:${id}:${state}`);
  const closure = closureOf({ cwd, rev: 'HEAD', roots: [entry.artifact] });
  if (closure.lines.length > 0) throw new Error(`closure:${closure.lines[0]}`);
  const inputs = blobsOf({ cwd, rev: 'HEAD', files: closure.files });
  if (inputs[entry.artifact] === undefined) throw new Error(`closure:missing:${entry.artifact}`);
  const dirty = uncommittedLines(cwd, closure.files);
  if (dirty.length > 0) throw new Error(`uncommitted:${id}:${dirty[0]}`);
  const old = readRecord(cwd, 'HEAD', 'green', id);
  if (old.line) throw new Error(old.line);
  const rec = bindRecord({
    schema: 'promise-green-v1', id, artifact: entry.artifact, test_name: entry.test_name,
    artifact_blob: inputs[entry.artifact], red_of: old.rec ? old.rec.red_of : red.rec.artifact_blob,
    identity_sha: identityHash(row, entry), inputs, commit: gitHead(cwd), run: runCounts(res.json),
  });
  if (!old.rec) return writeExclusive(cwd, 'green', rec);
  const oldInputs = old.rec.inputs && typeof old.rec.inputs === 'object' ? old.rec.inputs : {};
  const treeBlobs = blobsFor(cwd, 'HEAD', Object.keys(oldInputs));
  if (!isStale(old.rec, treeBlobs)) throw new Error(`fresh:${id}`);
  return reRecord(cwd, old.rec, rec, treeBlobs);
}
