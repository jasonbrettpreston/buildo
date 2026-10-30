// SPEC LINK: docs/specs/01-pipeline/69a_mcbylaw_register.md MB-67 (commit gate); plan arm P, lines 81-85 (P1, P2);
//            R-KM (a panel record per Layer 2/3 commit), R-LC (the panel judges Layer 2/3 work).
//
// HOW arm P judges a commit. The record is read IN THE COMMIT'S OWN TREE (the index for a staged set, the commit for
// a landed one — never HEAD, never the parent): `docs/reports/panels/<task>.json`, named by the `McBylaws-Task`
// trailer: parsable JSON, `task` equal to the trailer, `plan` and `output` non-empty strings; no task trailer is
// `no-record`. R-LE(a) is shared with arm C: exactly one `layer23` path, it is a prereg file, and the message cites no
// ids — the bootstrap commit needs no record. Fail closed: no task, an unreadable record and any throw are failures,
// never a pass, and an empty parse is never "nothing to check". The pre-push summary (arm S) reads the same rules
// through `recordOk` / `isSolePrereg` / `panelForPaths`, so its panel column cannot drift from this arm.

import { PREREG_RE } from './cite-arms.mjs';
import { parseMessage } from './cite-parse.mjs';
import { readAt } from './git-util.mjs';
import { allPaths } from './name-status.mjs';
import { classify, POLICY_PATH, validatePolicy } from './paths.mjs';

const CANNOT = 'FAIL:P:cannot-decide';
const suffix = (sha) => (typeof sha === 'string' && sha !== '' ? `:${sha}` : '');
const nonEmpty = (s) => typeof s === 'string' && s.length > 0;

/** The record a panel verdict is read from; only `MB-<n>` reaches here (the trailer pattern is that tight). */
export const recordPath = (task) => `docs/reports/panels/${task}.json`;

/** P2: the record must be JSON naming this task, with a written plan and a written output. */
export function recordOk(text, task) {
  if (!nonEmpty(task)) return false;
  let obj;
  try { obj = JSON.parse(text); } catch { return false; }
  return Boolean(obj) && typeof obj === 'object' && !Array.isArray(obj)
    && obj.task === task && nonEmpty(obj.plan) && nonEmpty(obj.output);
}

/**
 * R-LE(a): one Layer 2/3 path (paths already filtered to layer23 by the caller), a prereg file, no cited id.
 * @param {string[]} paths @param {string} message
 */
export function isSolePrereg(paths, message) {
  if (!Array.isArray(paths) || paths.length !== 1 || typeof paths[0] !== 'string') return false;
  if (!PREREG_RE.test(paths[0])) return false;
  try { return parseMessage(message).ids.length === 0; } catch { return false; }
}

/**
 * The summary's panel column for one commit: `'exempt'` (a sole-prereg commit), `true` / `false` (a valid record in
 * this tree / none), `'invalid'` (present but not a record for this task) and `null` when no record can be named.
 * @param {{cwd:string, ownRev:string, task:string|null, layer23Paths:string[], message:string}} args
 */
export function panelForPaths(args) {
  try {
    const { cwd, ownRev, task, layer23Paths, message } = args || {};
    if (isSolePrereg(layer23Paths, message)) return 'exempt';
    if (!nonEmpty(task)) return null;
    const text = readAt(cwd, ownRev, recordPath(task));
    if (text === null) return false;
    return recordOk(text, task) ? true : 'invalid';
  } catch {
    return null;
  }
}

function run({ cwd, policy, entries, message, ownRev, sha }) {
  const paths = allPaths(entries);
  const l23 = paths.filter((p) => classify(policy, p).layer23);
  if (l23.length === 0) return [];
  // R-LC: a Layer 2/3 change is judged under the policy IN ITS OWN TREE; a missing or malformed one is fail closed.
  const text = readAt(cwd, ownRev, POLICY_PATH);
  if (text === null) return [`${CANNOT}${suffix(sha)}`];
  let live;
  try { live = validatePolicy(JSON.parse(text)).policy; } catch { live = undefined; }
  if (!live) return [`${CANNOT}${suffix(sha)}`];
  const parsed = parseMessage(message);
  const scoped = paths.filter((p) => classify(live, p).layer23);
  // A tree without a policy has no reading of what is in scope: it can never read as "nothing to check".
  if (scoped.length === 0) return [scoped.length === l23.length ? [] : `${CANNOT}${suffix(sha)}`];
  // R-LE(a): the bootstrap commit — one Layer 2/3 path, a prereg file, no citation in the message — needs no record.
  if (isSolePrereg(scoped, message)) return [];
  if (parsed.task === null) return [`FAIL:P:no-record${suffix(sha)}`];
  const record = readAt(cwd, ownRev, recordPath(parsed.task));
  if (record === null) return [`FAIL:P:no-record${suffix(sha)}`];
  return recordOk(record, parsed.task) ? [] : [`FAIL:P:bad-record${suffix(sha)}`];
}

/**
 * Arm P for ONE commit (or one staged set). `ownRev` is '' (the index) or the commit sha — the record must live in
 * that tree. Terminates `:<sha>` onto a verdict when a sha is given. Never throws.
 * @param {{cwd:string, policy:object, entries:Array<{status:string,path:string,oldPath:string|null}>,
 *          message:string, ownRev:string, sha?:string}} args
 * @returns {string[]} every verdict string; `[]` is a pass
 */
export function panelForCommit(args) {
  try {
    if (!args || !Array.isArray(args.entries) || typeof args.ownRev !== 'string') return [CANNOT];
    return run(args);
  } catch {
    return [`${CANNOT}${suffix(args?.sha)}`];
  }
}
