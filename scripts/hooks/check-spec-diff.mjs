#!/usr/bin/env node
/**
 * WF2 gate J (half 1) — the commit-msg SPEC-DIFF rule (Spec 124 Rule 13, R-AG).
 *
 * Rule 13 "understandable": a change to the STEP CONTRACT or a step's own
 * `*.descriptor.json` moves behaviour, so the spec that describes it must move in
 * the SAME commit — or the author must say, in writing, why no spec change is
 * needed. A silent contract change is the failure this gate closes.
 *
 * The rule, per commit, over `git diff --cached --name-only --diff-filter=ACMRD`:
 *   TRIGGER — any staged path under `scripts/steps/`, `scripts/lib/compute/`, or
 *             any `*.descriptor.json` (a contract- or step-shaped change).
 *   NOT TRIGGERED → exit 0 (nothing to say).
 *   `spec_staged` — some staged path is `docs/specs/**.md` → exit 0 (the spec moved).
 *   `declared_NA` — the message BODY (after the subject, `#` comment lines
 *                   excluded) carries `Spec-diff: N-A <why>` with a why of ≥ 10
 *                   non-space characters → exit 0 (a written, non-trivial why).
 *   RED otherwise → exit 1, printing the triggering paths and BOTH remedies.
 *
 * Pure core `specDiffDecision(stagedPaths, messageText)` is exported so the test
 * can drive every arm without a git invocation; the CLI wraps it.
 *
 * Usage: node scripts/hooks/check-spec-diff.mjs <commit-msg-file>
 * Exit codes: 0 = not triggered / spec_staged / declared_NA · 1 = RED · 2 = bad setup.
 *
 * SPEC LINK: docs/specs/01-pipeline/124_step_standard_policy.md Rule 13, §5 R-AG, §5 R-BA (gate J)
 */

import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

/** A staged path that makes the spec-diff rule apply (Rule 13's trigger set). */
export const TRIGGER_RES = [
  /^scripts\/steps\//,
  /^scripts\/lib\/compute\//,
  /\.descriptor\.json$/,
];
/** A staged path that satisfies the rule by moving the spec itself. */
export const SPEC_RE = /^docs\/specs\/.+\.md$/;
/** `Spec-diff: N-A <why>` with a why of at least 10 non-space characters. */
export const N_A_RE = /^Spec-diff: N-A (\S.*)$/;
const MIN_WHY = 10;

const isTrigger = (p) => TRIGGER_RES.some((re) => re.test(p));

/**
 * The message BODY: every line after the first, MINUS `#` comment lines (the
 * git commit-msg template's own lines are not declarations).
 * @param {string} messageText
 * @returns {string[]}
 */
export function messageBody(messageText) {
  const lines = String(messageText == null ? '' : messageText).split(/\r?\n/);
  return lines.slice(1).filter((l) => !l.trimStart().startsWith('#'));
}

/**
 * The single source of truth: does this commit owe a `Spec-diff:` declaration?
 * @param {string[]} stagedPaths staged file paths (repo-relative)
 * @param {string} messageText the full commit-msg file contents
 * @returns {{status:'not_triggered'|'spec_staged'|'declared_NA'|'red', triggers:string[]}}
 */
export function specDiffDecision(stagedPaths, messageText) {
  const paths = Array.isArray(stagedPaths) ? stagedPaths : [];
  const triggers = paths.filter(isTrigger);
  if (triggers.length === 0) return { status: 'not_triggered', triggers: [] };
  if (paths.some((p) => SPEC_RE.test(p))) return { status: 'spec_staged', triggers };
  const declared = messageBody(messageText).some((l) => {
    const m = l.match(N_A_RE);
    return !!m && m[1].trim().length >= MIN_WHY;
  });
  return { status: declared ? 'declared_NA' : 'red', triggers };
}

/** `git diff --cached --name-only --diff-filter=ACMRD` (staged adds/copies/mods/renames/deletes). */
export function stagedPaths() {
  const out = execFileSync('git', ['diff', '--cached', '--name-only', '--diff-filter=ACMRD'], { encoding: 'utf8' });
  return out.split('\n').map((s) => s.trim()).filter(Boolean);
}

function main(argv) {
  const file = argv.find((a) => !a.startsWith('-'));
  if (!file) {
    process.stderr.write('usage: check-spec-diff.mjs <commit-msg-file>\n');
    process.exitCode = 2;
    return;
  }
  let messageText = '';
  try {
    messageText = fs.readFileSync(file, 'utf8');
  } catch (e) {
    process.stderr.write(`check-spec-diff: cannot read ${file}: ${e.message}\n`);
    process.exitCode = 2;
    return;
  }
  const { status, triggers } = specDiffDecision(stagedPaths(), messageText);
  if (status !== 'red') return;
  process.stderr.write(
    'SPEC-DIFF (gate J, Spec 124 Rule 13) — this commit changes the step contract but neither stages a spec nor declares why none is needed.\n'
    + `  triggering path(s):\n${triggers.map((t) => `    - ${t}`).join('\n')}\n`
    + '  remedy A — stage the spec that moved: `git add docs/specs/...`\n'
    + '  remedy B — declare why none is needed, in the commit BODY (not the subject):\n'
    + '    Spec-diff: N-A <why of at least 10 characters>\n',
  );
  process.exitCode = 1;
}

if (process.argv[1] && process.argv[1].endsWith('check-spec-diff.mjs')) main(process.argv.slice(2));

export { MIN_WHY };
