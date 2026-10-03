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
import { spawnSync } from 'node:child_process';

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

  // WF2 generated Target Files, Amendment 1 (2026-09-29): the drift check is its OWN pre-commit
  // line — `fastInvariants()` is never reached by a spec-, census- or snapshot-only commit
  // (step-validate --staged returns early), so it cannot live there.
  it('GREEN — runs the generated Target Files drift check right after the template-freeze check (Amendment 1)', () => {
    const code = stripComments(PRE_COMMIT);
    const at = code.indexOf('node scripts/analysis/generate-target-files.mjs --check');
    expect(at).toBeGreaterThan(-1);
    expect(at).toBeGreaterThan(code.indexOf('generate-template-freeze.mjs --check'));
    expect(at).toBeLessThan(code.indexOf('step-validate.mjs --staged --fast'));
  });

  it('RED — a tampered pre-commit with the Target Files drift check stripped is caught', () => {
    const tampered = PRE_COMMIT.replace(/node scripts\/analysis\/generate-target-files\.mjs --check && \\\n\s*/, '');
    expect(stripComments(tampered)).not.toContain('generate-target-files.mjs --check');
  });

  // Registry-truth P1-C-src (plan Fold 14): the generated src/ SQL ledger
  // (scripts/steps/_schema/src-sql-ledger.json) is drift-checked on EVERY commit,
  // together with its closed interpolated-file growth lock — its own line, for the
  // same reason as the Target Files check (step-validate --staged returns early on
  // a commit that stages no step file, so a src/-only commit would never reach it).
  it('GREEN — runs the src/ SQL ledger drift + closed-set check right after the Target Files check (P1-C-src)', () => {
    const code = stripComments(PRE_COMMIT);
    const at = code.indexOf('node scripts/analysis/src-sql-ledger.mjs --check');
    expect(at).toBeGreaterThan(-1);
    expect(at).toBeGreaterThan(code.indexOf('generate-target-files.mjs --check'));
    expect(at).toBeLessThan(code.indexOf('step-validate.mjs --staged --fast'));
  });

  it('RED — a tampered pre-commit with the src/ SQL ledger check stripped is caught', () => {
    const tampered = PRE_COMMIT.replace(/node scripts\/analysis\/src-sql-ledger\.mjs --check && \\\n\s*/, '');
    expect(stripComments(tampered)).not.toContain('src-sql-ledger.mjs --check');
  });

  // WF3 chain_args generated (2026-10-03, Spec 124 R-AZ): the manifest's chain_args for every CONVERTED
  // step are derived from the descriptor's execution.invocation; the drift check is its own pre-commit
  // line after the Target Files and src/ SQL ledger checks.
  it('GREEN — runs the generated chain_args drift check after the Target Files and src/ SQL ledger checks (R-AZ)', () => {
    const code = stripComments(PRE_COMMIT);
    const at = code.indexOf('node scripts/analysis/generate-chain-args.mjs --check');
    expect(at).toBeGreaterThan(-1);
    expect(at).toBeGreaterThan(code.indexOf('node scripts/analysis/generate-target-files.mjs --check'));
    expect(at).toBeGreaterThan(code.indexOf('node scripts/analysis/src-sql-ledger.mjs --check'));
    expect(at).toBeLessThan(code.indexOf('step-validate.mjs --staged --fast'));
  });

  it('RED — a tampered pre-commit with the chain_args drift check stripped is caught', () => {
    const tampered = PRE_COMMIT.replace(/node scripts\/analysis\/generate-chain-args\.mjs --check && \\\n\s*/, '');
    expect(tampered).not.toBe(PRE_COMMIT);
    expect(stripComments(tampered)).not.toContain('generate-chain-args.mjs --check');
  });
});

// ---------------------------------------------------------------------------
// WF2 hygiene H6 (2026-09-27) — hooks run in EVERY worktree. `core.hooksPath`
// used to be `.husky/_`, a husky-GENERATED, gitignored directory that
// `npm ci --ignore-scripts` never creates, so a fresh worktree silently ran NO
// hooks (21 hookless commits on 2026-09-27). The hooks path is now the TRACKED
// `.husky` directory, so each tracked hook must be directly executable by git:
// a `#!/bin/sh` first line (Git for Windows reads the shebang) AND mode 100755
// in the index (git on Linux ignores a non-executable hook, with only a hint).
// ---------------------------------------------------------------------------
describe('hooks path (H6) — every worktree runs the tracked .husky hooks', () => {
  const PKG = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'package.json'), 'utf8')) as { scripts: Record<string, string> };
  const HOOK_NAMES = ['pre-commit', 'pre-push', 'commit-msg', 'prepare-commit-msg'];

  it('GREEN — `prepare` sets core.hooksPath via install-hooks.mjs (never the generated `husky` wrapper); worktree:setup verifies', () => {
    expect(PKG.scripts.prepare).toBe('node scripts/hooks/install-hooks.mjs');
    expect(PKG.scripts['worktree:setup']).toMatch(/npm ci --ignore-scripts/);
    expect(PKG.scripts['worktree:setup']).toMatch(/npm rebuild @ast-grep\/cli/);
    expect(PKG.scripts['worktree:setup']).toMatch(/node scripts\/hooks\/install-hooks\.mjs --verify$/);
    const installer = fs.readFileSync(path.join(REPO_ROOT, 'scripts/hooks/install-hooks.mjs'), 'utf8');
    expect(installer).toContain("'core.hooksPath', HOOKS_PATH");
    expect(installer).toContain("const HOOKS_PATH = '.husky';");
  });

  it('GREEN — every tracked hook starts `#!/bin/sh` and is mode 100755 in the index', () => {
    const r = spawnSync('git', ['ls-files', '-s', '--', ...HOOK_NAMES.map((n) => `.husky/${n}`)], { cwd: REPO_ROOT, encoding: 'utf8' });
    expect(r.status).toBe(0);
    const modes = new Map(r.stdout.trim().split('\n').map((l) => [l.split('\t')[1], l.split(/\s+/)[0]]));
    for (const name of HOOK_NAMES) {
      expect(modes.get(`.husky/${name}`), `.husky/${name} index mode`).toBe('100755');
      const first = fs.readFileSync(path.join(REPO_ROOT, '.husky', name), 'utf8').split('\n', 1)[0];
      expect(first, `.husky/${name} shebang`).toBe('#!/bin/sh');
    }
  });
});
