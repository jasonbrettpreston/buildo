#!/usr/bin/env node
/**
 * Spec 124 R-EZ — independent verification before integration (McDonald's Airtight V3, operator y 2026-10-20:
 * "y on 2 and 4"). The commit-msg half of the rule, the one part a hook can observe:
 *
 *   On a branch named `…integrate-<N>` (e.g. `wf2/p4-integrate-11`), every commit message cites the
 *   verification report `docs/reports/verification/<branch>.md`, and that file is in the index (committed
 *   or staged). Any other branch (or a detached HEAD) is not triggered.
 *
 * The verification itself — a fresh lane that did not write the work re-checks, read-only, every landing
 * lane's cited rule ids + file:line + quotes, red-first tests (fail on the parent, pass after), reported test
 * counts and step-validate exit codes, and assessment/scorecard evidence — stays procedural (Spec 124 R-EZ).
 * This hook only makes "the integrate commit cites it" observable.
 *
 * Pure core `integrateVerificationDecision(branch, messageText, fileInIndex)`; the CLI wraps it.
 * Usage: node scripts/hooks/check-integrate-verification.mjs <commit-msg-file>
 * Exit codes: 0 = not triggered / cited · 1 = RED · 2 = bad setup.
 *
 * SPEC LINK: docs/specs/01-pipeline/124_step_standard_policy.md §5 R-EZ
 */

import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

export const INTEGRATE_BRANCH_RE = /(^|\/)[^/]*integrate-[0-9]+$/;
export const verificationPathFor = (branch) => `docs/reports/verification/${branch}.md`;

/**
 * @param {string|null} branch the current branch name (null when detached)
 * @param {string} messageText the commit message file's text
 * @param {(rel: string) => boolean} fileInIndex
 * @returns {{ok: boolean, reason: string}}
 */
export function integrateVerificationDecision(branch, messageText, fileInIndex) {
  if (!branch || !INTEGRATE_BRANCH_RE.test(branch)) return { ok: true, reason: 'not an integrate-N branch' };
  const rel = verificationPathFor(branch);
  const body = String(messageText || '').split('\n').filter((l) => !l.startsWith('#')).join('\n');
  if (!body.includes(rel)) return { ok: false, reason: `an ${branch} commit must cite ${rel} (Spec 124 R-EZ)` };
  if (!fileInIndex(rel)) return { ok: false, reason: `${rel} is cited but not committed or staged (Spec 124 R-EZ)` };
  return { ok: true, reason: `cites ${rel}` };
}

function main(argv) {
  const msgFile = argv[0];
  if (!msgFile) {
    console.error('usage: check-integrate-verification.mjs <commit-msg-file>');
    process.exitCode = 2;
    return;
  }
  let branch = null;
  try {
    branch = execFileSync('git', ['symbolic-ref', '--quiet', '--short', 'HEAD'], { encoding: 'utf8' }).trim() || null;
  } catch {
    branch = null; // detached HEAD (rebase, bisect): not an integrate commit
  }
  const inIndex = (rel) => {
    try {
      execFileSync('git', ['cat-file', '-e', `:${rel}`], { stdio: 'ignore' });
      return true;
    } catch {
      return false;
    }
  };
  const d = integrateVerificationDecision(branch, fs.readFileSync(msgFile, 'utf8'), inIndex);
  if (!d.ok) {
    console.error(`[check-integrate-verification] RED: ${d.reason}`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) main(process.argv.slice(2));
