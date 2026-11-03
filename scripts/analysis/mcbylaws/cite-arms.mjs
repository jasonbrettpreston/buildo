// SPEC LINK: docs/specs/01-pipeline/124_step_standard_policy_appendix.md R-KV (task trailer), R-KG (OWED means
//   blocked; BOOT-1 the one exemption), R-KH (cites a RULED rule), R-LE (RULED is a closed list, sole-prereg
//   exemption); docs/specs/01-pipeline/133_bylaw_handbook.md G67-06 (sentinels), G67-07a (bootstrap prereg);
//   plan arm C (MB-67), checks CT1..CT11.
//   R-MA (amends R-KV; 2026-11-01-batch-ao#CHAT-216.O-28): CT2 reads the task's NEWEST prereg-<task>-<k>.json (integer k);
//   a legacy-named prereg-*.json is a rules source only while the task has no file of that form (a scope condition).
//
// HOW the citation checks are asked. A commit touching a `layer23` path must carry a `McBylaws-Task` trailer
// (CT1/CT7); its task's newest prereg committed in the PARENT tree (R-MA: the highest k of prereg-<task>-<k>.json; a
// legacy-named file only while the task has none) must carry a non-empty `rules[]` (CT2 — the index never counts);
// every rule in that file must be RULED (CT6/CT10/CT11); every cited id must be in the file and not
// OWED (CT3/CT4/CT5); BOOT-1 is accepted only for a task the policy lists (CT8), and the exemption must close (CT9).
// Fail closed: a sentinel parse that does not see its witnesses, a git read that returns null, and any throw are
// `FAIL:C:cannot-decide` — never a pass, and an empty parse is never "nothing to check".

import { listTracked, readAt } from './git-util.mjs';
import { allPaths } from './name-status.mjs';
import { classify } from './paths.mjs';
import { isRuled, parseMessage, sentinelsOk } from './cite-parse.mjs';
import { byNewest, parsePreregName } from './prereg-name.mjs';

export const PREREG_RE = /^scripts\/analysis\/bylaw-validation\/coa-expected\/prereg-[^/]+\.json$/;
const CANNOT = 'FAIL:C:cannot-decide';
const BOOT = 'BOOT-1';
const suffix = (sha) => (typeof sha === 'string' && sha !== '' ? `:${sha}` : '');
const bootListed = (policy, task) => (policy?.boot1?.tasks || []).includes(task);
const flagged = (sha) => `${CANNOT}${suffix(sha)}`;

/**
 * R-MA: the rules source of `task` in `rev`, as {status, prereg, file}. When the task has files of the form
 * prereg-<task>-<k>.json, ONLY the highest integer k is read: unreadable or unparsable is 'cannot', a JSON task that is not
 * `task` is 'mismatch', an empty rules[] is 'none' (no fall-back to an older file), else 'ok'. Only when the task has NO such
 * file (a scope condition, not an exception) are the legacy-named prereg-*.json files scanned in byte order, as before: the
 * first whose task is `task` with a non-empty rules[]. A form file of another task is never read in either branch.
 */
function findPrereg(cwd, rev, task) {
  const tracked = listTracked(cwd, rev);
  if (!Array.isArray(tracked)) return { status: 'cannot', prereg: null, file: null };
  const formed = new Set();
  const mine = [];
  for (const p of tracked) {
    const name = parsePreregName(p);
    if (!name) continue;
    formed.add(p);
    if (name.task === task) mine.push({ p, k: name.k });
  }
  if (mine.length > 0) {
    const file = mine.sort(byNewest)[0].p;
    const text = readAt(cwd, rev, file);
    if (text === null) return { status: 'cannot', prereg: null, file };
    let obj;
    try { obj = JSON.parse(text); } catch { return { status: 'cannot', prereg: null, file }; }
    if (obj === null || typeof obj !== 'object' || Array.isArray(obj)) return { status: 'cannot', prereg: null, file };
    if (obj.task !== task) return { status: 'mismatch', prereg: null, file };
    if (!Array.isArray(obj.rules) || obj.rules.length === 0) return { status: 'none', prereg: null, file };
    return { status: 'ok', prereg: obj, file };
  }
  for (const p of tracked) {
    if (!PREREG_RE.test(p) || formed.has(p)) continue;
    const text = readAt(cwd, rev, p);
    if (text === null) continue;
    let obj;
    try { obj = JSON.parse(text); } catch { continue; }
    if (obj && obj.task === task && Array.isArray(obj.rules) && obj.rules.length > 0) return { status: 'ok', prereg: obj, file: p };
  }
  return { status: 'none', prereg: null, file: null };
}

/** R-LE(a): a sole-parsed-prereg commit with no cite is the bootstrap commit (G67-07a). */
function solePrereg(cwd, ownRev, l23) {
  if (l23.length !== 1 || !PREREG_RE.test(l23[0])) return false;
  const text = readAt(cwd, ownRev, l23[0]);
  if (text === null) return false;
  try { JSON.parse(text); } catch { return false; }
  return true;
}

const RED_DIR = 'docs/reports/red-evidence/';
const LANDED = new Set(['A', 'M']);
const lands = (e, p) => e.path === p && LANDED.has(e.status);

/**
 * R-KG exception: an OWED rule may be cited when the SAME commit lands its named lock (added, or modified to
 * green) AND carries red evidence (a new file under the red-evidence directory). A row with no named lock, a
 * deleted lock, or a commit without red evidence can never use it.
 * @param {string} id @param {Map<string, {status:string, locks?:string[]}>} rows
 * @param {Array<{status:string, path:string}>} entries @returns {boolean}
 */
export function lockLands(id, rows, entries) {
  const locks = rows?.get?.(id)?.locks;
  if (!Array.isArray(locks) || locks.length === 0 || !Array.isArray(entries)) return false;
  const evidence = entries.some((e) => e?.status === 'A' && String(e.path ?? '').startsWith(RED_DIR));
  return evidence && entries.some((e) => locks.some((p) => lands(e, p)));
}

/**
 * An OWED rule (per the sentinel set or the row status) whose named lock lands in the same commit, with red evidence.
 * @param {string} id @param {Map<string, {status:string, locks?:string[]}>} rows
 * @param {Set<string>} owed @param {Array<{status:string, path:string}>} entries @returns {boolean}
 */
export function landsId(id, rows, owed, entries) {
  return (owed.has(id) || rows.get(id)?.status === 'OWED') && lockLands(id, rows, entries);
}

/** @returns {string[]} every verdict string; `[]` is a pass */
function run({ cwd, policy, entries, message, parentRev, ownRev, owed, rows, sha }) {
  const paths = allPaths(entries);
  const l23 = paths.filter((p) => classify(policy, p).layer23);
  if (l23.length === 0) return [];
  if (!sentinelsOk(owed, rows)) return [flagged(sha)];
  const parsed = parseMessage(message);
  if (parsed.ids.length === 0 && solePrereg(cwd, ownRev, l23)) return [];
  if (parsed.task === null) return [`FAIL:C:no-task${suffix(sha)}`];
  if (parsed.usesBoot1 && !bootListed(policy, parsed.task)) return [`FAIL:C:boot1-not-allowed${suffix(sha)}`];
  const found = findPrereg(cwd, parentRev, parsed.task);
  if (found.status === 'cannot') return [flagged(sha)];
  if (found.status === 'mismatch') return [`FAIL:C:prereg-task-mismatch:${found.file}${suffix(sha)}`];
  if (found.status !== 'ok') return [`FAIL:C:no-rules${suffix(sha)}`];
  const prereg = found.prereg;
  const rules = prereg.rules;
  const accepted = new Set();
  const out = [];
  const landsIdHere = (id) => landsId(id, rows, owed, entries);
  for (const id of rules) {
    if (id === BOOT && bootListed(policy, parsed.task)) { accepted.add(id); continue; }
    if (!isRuled(rows, id) && !landsIdHere(id)) out.push(`FAIL:C:not-ruled:${id}${suffix(sha)}`);
  }
  for (const id of parsed.ids) {
    if (accepted.has(id)) continue;
    if ((owed.has(id) || rows.get(id)?.status === 'OWED') && !lockLands(id, rows, entries)) {
      out.push(`FAIL:C:owed:${id}${suffix(sha)}`);
      continue;
    }
    if (!rules.includes(id)) out.push(`FAIL:C:cite-not-in-rules:${id}${suffix(sha)}`);
  }
  return out;
}

/**
 * Arm C for ONE commit (or one staged set). `parentRev` is 'HEAD' or `<sha>^`; `ownRev` is '' (the index) or the sha.
 * @param {{cwd:string, policy:object, entries:Array<{status:string,path:string,oldPath:string|null}>,
 *          message:string, parentRev:string, ownRev:string, owed:Set<string>, rows:Map<string,{status:string}>,
 *          sha?:string}} args
 * @returns {string[]}
 */
export function citeForCommit(args) {
  try {
    if (!args || !Array.isArray(args.entries)) return [CANNOT];
    return run(args);
  } catch {
    return [flagged(args?.sha)];
  }
}

/** CT9: the BOOT-1 exemption must close once MB-67 is DONE. */
export function boot1Check(policy, mb67Done) {
  try {
    const tasks = policy?.boot1?.tasks;
    if (!Array.isArray(tasks)) return [CANNOT];
    return tasks.length > 0 && mb67Done === true ? ['FAIL:C:boot1-open'] : [];
  } catch {
    return [CANNOT];
  }
}
