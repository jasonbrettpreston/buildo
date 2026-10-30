// SPEC LINK: docs/specs/01-pipeline/69a_mcbylaw_register.md MB-67 (commit gate); plan arm H (lines 42-52) and
//            arm R (lines 88-93); R-KP, R-KX, R-LE(b) — the layer 2/3 hold behind an APPROVED record.
//
// HOW the hold is asked. A commit whose changed paths (BOTH sides of a rename, arm R) include a `layer23` path may
// only land while `mcbylaws/APPROVED` already exists — at commit time in HEAD, at push and CI in each commit's PARENT
// (H6: the APPROVED commit itself is not Layer 2/3 and rides along). The record is one line `O-1 APPROVED YYYY-MM-DD`
// (H3); it lands alone (H4); a file only on disk or in the index is not in the tree (H2). Fail closed: any git error
// or null read is `FAIL:H:cannot-decide`, never a pass; an empty path list is not read as "nothing to check".

import { pathExistsAt, readAt, commitsInRange, changesOfCommit } from './git-util.mjs';
import { parseNameStatusZ, allPaths } from './name-status.mjs';
import { classify, deadGlobs } from './paths.mjs';

const APPROVED = 'mcbylaws/APPROVED';
const APPROVED_LINE = /^O-1 APPROVED \d{4}-\d{2}-\d{2}$/;
const CANNOT = 'FAIL:H:cannot-decide';
const suffix = (sha) => (typeof sha === 'string' && sha !== '' ? `:${sha}` : '');

/**
 * Arm H for ONE commit (or one staged set). Each returned string is a verdict; `[]` is a pass.
 * @param {{cwd:string, policy:object, entries:Array<{status:string,path:string,oldPath:string|null}>,
 *          parentRev:string, sha?:string, onDiskApproved?:boolean}} args
 * @returns {string[]}
 */
export function holdForCommit({ cwd, policy, entries, parentRev, sha, onDiskApproved = false }) {
  const out = [];
  try {
    if (!Array.isArray(entries)) return [`${CANNOT}${suffix(sha)}`];
    const paths = allPaths(entries);
    const approvedTouched = paths.includes(APPROVED);
    // H4: the record lands alone.
    if (approvedTouched && paths.length > 1) out.push(`FAIL:H:approved-not-alone${suffix(sha)}`);
    // The hold does not apply to a change with no Layer 2/3 path (the operator's sole APPROVED commit, R-LE(b)).
    if (!paths.some((p) => classify(policy, p).layer23)) return out;
    // H2: present on disk but not in the parent tree is not present.
    if (!pathExistsAt(cwd, parentRev, APPROVED)) {
      out.push(`${onDiskApproved ? 'FAIL:H:not-in-head' : 'FAIL:H:no-approved'}${suffix(sha)}`);
      return out;
    }
    // H3: the first line is the record and nothing else.
    const text = readAt(cwd, parentRev, APPROVED);
    const first = text === null ? null : text.split('\n')[0];
    if (first === null || !APPROVED_LINE.test(first)) out.push(`FAIL:H:bad-content${suffix(sha)}`);
    return out;
  } catch {
    return [`${CANNOT}${suffix(sha)}`];
  }
}

/**
 * Arm H over a pushed / CI range. APPROVED is asked in each Layer 2/3 commit's PARENT tree (H6), oldest first.
 * @param {{cwd:string, policy:object, base:string, tip:string}} args
 * @returns {string[]}
 */
export function holdForRange({ cwd, policy, base, tip }) {
  try {
    const shas = commitsInRange(cwd, base, tip);
    if (shas === null) return [CANNOT];
    const out = [];
    for (const sha of shas) {
      const raw = changesOfCommit(cwd, sha);
      if (raw === null) {
        out.push(`${CANNOT}:${sha}`);
        continue;
      }
      const entries = parseNameStatusZ(raw);
      if (entries === null) {
        out.push(`${CANNOT}:${sha}`);
        continue;
      }
      out.push(...holdForCommit({ cwd, policy, entries, parentRev: `${sha}^`, sha, onDiskApproved: false }));
    }
    return out;
  } catch {
    return [CANNOT];
  }
}

/**
 * H7: every `layer23` glob matching zero tracked path and not listed in `pending_globs`.
 * @param {object} policy
 * @param {string[]} tracked
 * @returns {string[]}
 */
export function deadGlobLines(policy, tracked) {
  try {
    if (!Array.isArray(tracked)) return [CANNOT];
    return deadGlobs(policy, tracked)
      .filter((d) => d.list === 'layer23')
      .map((d) => `FAIL:H:dead-glob:${d.glob}`);
  } catch {
    return [CANNOT];
  }
}
