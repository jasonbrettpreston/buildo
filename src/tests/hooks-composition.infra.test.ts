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
const COMMIT_MSG_PATH = path.join(REPO_ROOT, '.husky/commit-msg');

const PRE_COMMIT = fs.readFileSync(PRE_COMMIT_PATH, 'utf8');
const PRE_PUSH = fs.readFileSync(PRE_PUSH_PATH, 'utf8');
const COMMIT_MSG = fs.readFileSync(COMMIT_MSG_PATH, 'utf8');

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
    // Pre-push followed the same day: the full suite at two forks hit the same timeout on the
    // same file (push of 7853342f, 2 errors / 0 failures), so BOTH hooks pin one fork.
    expect(stripComments(PRE_COMMIT)).toMatch(/\bVITEST_MAX_FORKS=1\b/);
    expect(stripComments(PRE_PUSH)).toMatch(/\bVITEST_MAX_FORKS=1\b/);
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
    const tampered = PRE_PUSH.replace(/VITEST_MAX_FORKS=1 npm run test\b/, 'true');
    expect(invokesFullSuite(tampered)).toBe(false);
  });

  // -------------------------------------------------------------------------
  // Gate J2b (Fold GC-4, Spec 124 §5 R-BA gate G Ask 2 ruling, WF2
  // "standardized gates", 2026-09-26) — pre-push also runs the FLEET-WIDE
  // `step-validate.mjs --all --fast`, not just `--staged --fast`: a
  // `scripts/lib/step/**` change can mismatch a golden capture's
  // `lib_fingerprint` on a step this push's own commits never touched (gate
  // G #39), and `--staged` alone cannot see that.
  // -------------------------------------------------------------------------
  it('GREEN — also re-runs step-validate --all --fast (Fold GC-4, fleet-wide freshness sweep)', () => {
    expect(stripComments(PRE_PUSH)).toMatch(/step-validate\.mjs --all --fast/);
  });

  it('RED — a tampered pre-push with the --all --fast sweep stripped is caught', () => {
    const tampered = PRE_PUSH.replace(/&& node scripts\/analysis\/step-validate\.mjs --all --fast/, '');
    expect(stripComments(tampered)).not.toMatch(/step-validate\.mjs --all --fast/);
  });
});

describe('hooks-composition (R-AG gate J) — commit-msg', () => {
  it('runs the pre-existing commit-msg + lesson-routing checks, unchanged', () => {
    expect(COMMIT_MSG).toContain('validate-commit-msg.sh');
    expect(COMMIT_MSG).toContain('check-lesson-routing.sh');
  });

  // -------------------------------------------------------------------------
  // Gate J1 (Spec 124 §5 R-BA gate J, Rule 13, WF2 "standardized gates",
  // 2026-09-26) — a commit touching the step contract must stage a spec or
  // declare `Spec-diff: N-A <why>`; check-spec-diff.mjs is the enforcer.
  // -------------------------------------------------------------------------
  it('GREEN — invokes check-spec-diff.mjs with the commit-msg file argument', () => {
    expect(stripComments(COMMIT_MSG)).toMatch(/check-spec-diff\.mjs "\$1"/);
  });

  it('RED — a tampered commit-msg with the spec-diff check stripped is caught', () => {
    const tampered = COMMIT_MSG.replace(/&& \\\nnode scripts\/hooks\/check-spec-diff\.mjs "\$1"/, '');
    expect(stripComments(tampered)).not.toMatch(/check-spec-diff\.mjs/);
  });
});

describe('hooks-composition (R-AG gate J) — pre-commit generated-doc + system-map + J2 lib-suite gates', () => {
  // -------------------------------------------------------------------------
  // Gate J (half 2): every committed docs/reports/generated/*.md is either
  // regenerated-and-drift-checked or explicitly retired — generated-docs.mjs
  // enforces it at commit time. system-map.infra.test.ts + schema-to-vocab.mjs
  // are the pre-existing generated-doc drift checks gate J now sits beside.
  // -------------------------------------------------------------------------
  it('GREEN — runs schema-to-vocab --check, the system-map test, and generated-docs.mjs', () => {
    const code = stripComments(PRE_COMMIT);
    expect(code).toMatch(/schema-to-vocab\.mjs --check docs\/reports\/generated\/122-vocabulary\.md/);
    expect(code).toMatch(/system-map\.infra\.test\.ts/);
    expect(code).toMatch(/gates\/generated-docs\.mjs/);
  });

  it('GREEN — the system-map test invocation is SCOPED (--run after the path), never a bare `vitest run` (would trip invokesFullSuite)', () => {
    expect(invokesFullSuite(PRE_COMMIT)).toBe(false);
    expect(stripComments(PRE_COMMIT)).toMatch(/vitest src\/tests\/system-map\.infra\.test\.ts --run/);
  });

  // -------------------------------------------------------------------------
  // Gate J2 (Spec 124 §5 R-BA gate G Ask 2 ruling, WF2 "standardized gates",
  // 2026-09-26) — a staged scripts/lib/step/** or scripts/lib/compute/**
  // path runs the full src/tests/steps/ suite too, not just `vitest related`
  // (lesson 2026-09-23: `related`'s import-graph analysis cannot see a
  // text-reading lock a library change breaks).
  // -------------------------------------------------------------------------
  it('GREEN — a staged scripts/lib/step|compute path triggers the full src/tests/steps/ suite', () => {
    const code = stripComments(PRE_COMMIT);
    expect(code).toMatch(/STAGED_LIB=.*scripts\/lib\/\(step\|compute\)\//);
    expect(code).toMatch(/vitest src\/tests\/steps\/ --run/);
  });

  it('RED — a tampered pre-commit with the J2 lib-suite invocation stripped is caught', () => {
    const tampered = PRE_COMMIT.replace(/VITEST_MIN_FORKS=1 VITEST_MAX_FORKS=1 npx vitest src\/tests\/steps\/ --run \|\| exit 1/, 'true');
    expect(stripComments(tampered)).not.toMatch(/vitest src\/tests\/steps\/ --run/);
  });
});
