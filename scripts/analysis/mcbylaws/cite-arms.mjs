// SPEC LINK: docs/specs/01-pipeline/124_step_standard_policy_appendix.md R-KV (task trailer), R-KG (OWED means
//   blocked; BOOT-1 the one exemption), R-KH (cites a RULED rule), R-LE (RULED is a closed list, sole-prereg
//   exemption); docs/specs/01-pipeline/133_bylaw_handbook.md G67-06 (sentinels), G67-07a (bootstrap prereg);
//   plan arm C (MB-67), checks CT1..CT11.
//
// HOW the citation checks are asked. A commit touching a `layer23` path must carry a `McBylaws-Task` trailer
// (CT1/CT7); its task must have a prereg committed in the PARENT tree with a non-empty `rules[]` (CT2 — the index
// never counts); every rule in that file must be RULED (CT6/CT10/CT11); every cited id must be in the file and not
// OWED (CT3/CT4/CT5); BOOT-1 is accepted only for a task the policy lists (CT8), and the exemption must close (CT9).
// Fail closed: a sentinel parse that does not see its witnesses, a git read that returns null, and any throw are
// `FAIL:C:cannot-decide` — never a pass, and an empty parse is never "nothing to check".

import { listTracked, readAt } from './git-util.mjs';
import { allPaths } from './name-status.mjs';
import { classify } from './paths.mjs';
import { isRuled, parseMessage, sentinelsOk } from './cite-parse.mjs';

export const PREREG_RE = /^scripts\/analysis\/bylaw-validation\/coa-expected\/prereg-[^/]+\.json$/;
const CANNOT = 'FAIL:C:cannot-decide';
const BOOT = 'BOOT-1';
const suffix = (sha) => (typeof sha === 'string' && sha !== '' ? `:${sha}` : '');
const bootListed = (policy, task) => (policy?.boot1?.tasks || []).includes(task);
const flagged = (sha) => `${CANNOT}${suffix(sha)}`;

/** The first tracked prereg in `rev` whose JSON names `task` and carries a non-empty `rules[]`; null if none. */
function findPrereg(cwd, rev, task) {
  const tracked = listTracked(cwd, rev);
  if (!Array.isArray(tracked)) return undefined;
  for (const p of tracked) {
    if (!PREREG_RE.test(p)) continue;
    const text = readAt(cwd, rev, p);
    if (text === null) continue;
    let obj;
    try { obj = JSON.parse(text); } catch { continue; }
    if (obj && obj.task === task && Array.isArray(obj.rules) && obj.rules.length > 0) return obj;
  }
  return null;
}

/** R-LE(a): a sole-parsed-prereg commit with no cite is the bootstrap commit (G67-07a). */
function solePrereg(cwd, ownRev, l23) {
  if (l23.length !== 1 || !PREREG_RE.test(l23[0])) return false;
  const text = readAt(cwd, ownRev, l23[0]);
  if (text === null) return false;
  try { JSON.parse(text); } catch { return false; }
  return true;
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
  const prereg = findPrereg(cwd, parentRev, parsed.task);
  if (prereg === undefined) return [flagged(sha)];
  if (prereg === null) return [`FAIL:C:no-rules${suffix(sha)}`];
  const rules = prereg.rules;
  const accepted = new Set();
  const out = [];
  for (const id of rules) {
    if (id === BOOT && bootListed(policy, parsed.task)) { accepted.add(id); continue; }
    if (!isRuled(rows, id)) out.push(`FAIL:C:not-ruled:${id}${suffix(sha)}`);
  }
  for (const id of parsed.ids) {
    if (accepted.has(id)) continue;
    if (owed.has(id) || rows.get(id)?.status === 'OWED') { out.push(`FAIL:C:owed:${id}${suffix(sha)}`); continue; }
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
