// SPEC LINK: docs/specs/01-pipeline/124_step_standard_policy.md R-AG
//
// WF2 "conversion velocity" (2026-09-14): pins the R-AG hook re-composition —
// pre-commit runs only the cheap/staged-scoped gates (stages 1-8 unchanged +
// typecheck + lint + `vitest related <staged>`), NEVER the full suite;
// pre-push runs the full suite once per push. `.husky/pre-commit` and
// `.husky/pre-push` are static shell files, not a generated artifact, so —
// mirroring template-freeze.infra.test.ts's own "pure function, unit-tested
// with fixtures" pattern (Spec 121 §12b.6) rather than that file's AJV/git
// machinery — this suite exercises two pure predicates directly against the
// live hook text AND against tampered string fixtures, proving both
// directions without ever writing to the real `.husky/` files.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const REPO_ROOT = path.resolve(__dirname, '../../');
const PRE_COMMIT_PATH = path.join(REPO_ROOT, '.husky/pre-commit');
const PRE_PUSH_PATH = path.join(REPO_ROOT, '.husky/pre-push');

const PRE_COMMIT = fs.readFileSync(PRE_COMMIT_PATH, 'utf8');
const PRE_PUSH = fs.readFileSync(PRE_PUSH_PATH, 'utf8');

/** Strips `#`-comment lines (and shebang) so a prose mention inside a comment
 * never trips a predicate meant to catch a real, executable invocation. */
function stripComments(hookText: string): string {
  return hookText
    .split('\n')
    .map((line) => (line.trim().startsWith('#') ? '' : line))
    .join('\n');
}

/**
 * PURE — does this hook's EXECUTABLE text invoke the full Vitest suite
 * (`npm run test`, or a bare `vitest run` with no path/related scoping)?
 * Comment-blind (see stripComments) so R-AG's own header prose describing
 * the change is never mistaken for a live invocation.
 */
function invokesFullSuite(hookText: string): boolean {
  const code = stripComments(hookText);
  return /\bnpm run test\b/.test(code) || /\bvitest run\b/.test(code);
}

/** PURE — does this hook's executable text invoke `vitest related`? */
function invokesVitestRelated(hookText: string): boolean {
  return /\bvitest related\b/.test(stripComments(hookText));
}

const STAGE_1_TO_8_COMMANDS = [
  'step-churn-complexity.mjs --check',
  'generate-template-freeze.mjs --check',
  'spec-split-check.mjs --check',
  'step-validate.mjs --staged --fast',
  'lint-staged',
  'validate-migrations.sh',
  'check-migration-down-comments.sh',
  'ast-grep-leads.sh',
];

describe('hooks-composition (R-AG) — pre-commit', () => {
  it('contains all 8 stage-1-8 commands, unchanged', () => {
    for (const cmd of STAGE_1_TO_8_COMMANDS) {
      expect(PRE_COMMIT, `pre-commit missing stage command: ${cmd}`).toContain(cmd);
    }
  });

  it('also runs typecheck and lint', () => {
    expect(PRE_COMMIT).toMatch(/\bnpm run typecheck\b/);
    expect(PRE_COMMIT).toMatch(/\bnpm run lint\b/);
  });

  it('GREEN — does NOT invoke the full suite (moved to pre-push)', () => {
    expect(invokesFullSuite(PRE_COMMIT)).toBe(false);
  });

  it('GREEN — both hooks cap vitest with VITEST_MAX_FORKS (the variable vitest reads) and never the no-op VITEST_MAX_WORKERS; pre-commit passes only src/ + scripts/ source files, one per line via xargs -d', () => {
    // Code Reviewer 2026-09-14: VITEST_MAX_WORKERS is not read by vitest 2.x (forks pool) —
    // every "capped" run was uncapped; a 4-fork suite was OS-killed for memory. And
    // `vitest related <non-source file>` falls back to a WIDE run, so the filter is load-bearing.
    // 2026-09-16 (I5 commit 9): pre-commit `related` runs at ONE fork — at two forks the
    // 498-test step-conformance suite died on `[vitest-worker]: Timeout calling "onTaskUpdate"`
    // four times running with zero test failures; at one fork it passed 498/498 in 281 s.
    // Pre-push (the full suite) keeps two.
    expect(stripComments(PRE_COMMIT)).toMatch(/\bVITEST_MAX_FORKS=1\b/);
    expect(stripComments(PRE_PUSH)).toMatch(/\bVITEST_MAX_FORKS=2\b/);
    for (const hook of [PRE_COMMIT, PRE_PUSH]) {
      expect(stripComments(hook)).not.toMatch(/VITEST_MAX_WORKERS/);
    }
    expect(stripComments(PRE_COMMIT)).toMatch(/grep -E '\^\(src\|scripts\)\/\.\*\\\.\(ts\|tsx\|js\|mjs\)\$'/);
    expect(stripComments(PRE_COMMIT)).toMatch(/xargs -d '\\n' npx vitest related --run/);
    expect(stripComments(PRE_COMMIT)).not.toMatch(/vitest related \$[A-Z_]+/); // no unquoted word-split expansion
  });

  it('GREEN — invokes `vitest related`, scoped to staged files', () => {
    expect(invokesVitestRelated(PRE_COMMIT)).toBe(true);
  });

  it('GREEN — a comment merely mentioning the full suite in prose does not trip invokesFullSuite (comment-blind, mirrors template-freeze\'s comment-blind phase-order extractor)', () => {
    const commentOnly = '# see npm run test in the CI docs, and a bare vitest run example\necho ok\n';
    expect(invokesFullSuite(commentOnly)).toBe(false);
  });

  it('RED — a tampered pre-commit that reintroduces `npm run test` is caught by invokesFullSuite', () => {
    const tampered = `${PRE_COMMIT.trimEnd()} && npm run test\n`;
    expect(invokesFullSuite(tampered)).toBe(true);
  });

  it('RED — a tampered pre-commit that reintroduces a bare `vitest run` is caught by invokesFullSuite', () => {
    const tampered = PRE_COMMIT.replace(/VITEST_MAX_FORKS=1 xargs -d '\\n' npx vitest related --run/, 'npx vitest run');
    expect(invokesFullSuite(tampered)).toBe(true);
  });

  it('RED — a tampered pre-commit with `vitest related` stripped out entirely is caught by invokesVitestRelated', () => {
    const tampered = PRE_COMMIT.replace(/VITEST_MAX_FORKS=1 xargs -d '\\n' npx vitest related --run/, 'true');
    expect(invokesVitestRelated(tampered)).toBe(false);
  });
});

describe('hooks-composition (R-AG) — pre-push', () => {
  it('re-runs step-validate --staged --fast, spec-split-check, and typecheck (Spec 123 R-R, unchanged)', () => {
    expect(PRE_PUSH).toContain('step-validate.mjs --staged --fast');
    expect(PRE_PUSH).toContain('spec-split-check.mjs --check');
    expect(PRE_PUSH).toMatch(/\bnpm run typecheck\b/);
  });

  it('GREEN — invokes the full suite exactly once per push', () => {
    expect(invokesFullSuite(PRE_PUSH)).toBe(true);
  });

  it('RED — a tampered pre-push with the full-suite invocation stripped is caught', () => {
    const tampered = PRE_PUSH.replace(/VITEST_MAX_FORKS=2 npm run test\b/, 'true');
    expect(invokesFullSuite(tampered)).toBe(false);
  });
});
