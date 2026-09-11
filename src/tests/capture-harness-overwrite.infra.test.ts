// SPEC LINK: docs/specs/01-pipeline/122_pipeline_step_optimization.md §5.3 (Condition 3 — the golden-master differential, ruling R-C)
// SPEC LINK: docs/specs/01-pipeline/124_step_standard_policy.md R-AC ("PRE captures are committed before any re-run — the harness overwrites in place")
// SPEC LINK: .cursor/wf2_c4_chain_completeness_gate_active_task.md (C4 step H, Fold A items 3/4 — ONE definition of "recoverable")
//
// Until 2026-09-11 `capture-step-golden.js --out=<file>` was a bare fs.writeFileSync:
// run 2 destroyed run 1's reference in place (pilot 9 commit 8 P6 did exactly that to
// enrich_parcels/post/sources_run1.json), with git history as the only rollback — and
// no rollback at all when the destroyed capture had never been committed.
//
// This file locks the guard BOTH DIRECTIONS (Spec 121 §12b.6):
//   1. `overwriteDecision` — pure, the 5 states the plan enumerates (+ the flag axis).
//   2. `captureGitState` — the ONE two-probe definition of "recoverable" (tracked in the
//      INDEX + worktree == index), proven against a throwaway git repo for every state:
//      absent / untracked / staged-new (`A `) / committed-clean / committed-modified (` M`)
//      / staged-and-modified (`AM`). step-validate.mjs's fast invariant #22 REUSES these
//      two functions, so proving them here proves #22's predicate too.
//   3. The real CLI refuses a committed capture without `--overwrite` BEFORE spawning the
//      step (the refusal must cost seconds, never the step's runtime).
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';

const REPO_ROOT = path.resolve(__dirname, '../../');
// eslint-disable-next-line @typescript-eslint/no-require-imports -- exercising the real CJS harness
const harness = require(path.join(REPO_ROOT, 'scripts/analysis/capture-step-golden.js')) as {
  overwriteDecision: (s: { exists: boolean; tracked: boolean; worktreeClean: boolean; overwriteFlag: boolean }) => { allow: boolean; reason: string; remedy: string };
  captureGitState: (file: string, opts?: { cwd?: string }) => { exists: boolean; tracked: boolean; worktreeClean: boolean };
};

describe('overwriteDecision — pure, the five states (C4 step H, R-AC)', () => {
  it('absent target → allowed (first capture)', () => {
    expect(harness.overwriteDecision({ exists: false, tracked: false, worktreeClean: true, overwriteFlag: false }).allow).toBe(true);
  });
  it('exists, no flag, tracked+clean → REFUSED, remedy names --overwrite', () => {
    const d = harness.overwriteDecision({ exists: true, tracked: true, worktreeClean: true, overwriteFlag: false });
    expect(d.allow).toBe(false);
    expect(d.remedy).toContain('--overwrite');
  });
  it('exists, flag, tracked+clean → allowed (git can restore it)', () => {
    expect(harness.overwriteDecision({ exists: true, tracked: true, worktreeClean: true, overwriteFlag: true }).allow).toBe(true);
  });
  it('exists, flag, UNTRACKED → REFUSED even with the flag (A1 ruled NO); remedy names rm / git clean, NOT git checkout (which cannot restore an untracked path)', () => {
    const d = harness.overwriteDecision({ exists: true, tracked: false, worktreeClean: true, overwriteFlag: true });
    expect(d.allow).toBe(false);
    expect(d.remedy).toMatch(/rm <file>|git clean/);
    expect(d.remedy).not.toContain('git checkout');
  });
  it('exists, flag, tracked but worktree ≠ index → REFUSED even with the flag (A1); remedy names git checkout -- <file>', () => {
    const d = harness.overwriteDecision({ exists: true, tracked: true, worktreeClean: false, overwriteFlag: true });
    expect(d.allow).toBe(false);
    expect(d.remedy).toContain('git checkout -- <file>');
  });
});

describe('captureGitState — the ONE two-probe definition of "recoverable", proven on a throwaway git repo', () => {
  let repo = '';
  const git = (...args: string[]) => execFileSync('git', args, { cwd: repo, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });

  beforeAll(() => {
    repo = fs.mkdtempSync(path.join(os.tmpdir(), 'buildo-capture-guard-'));
    git('init', '-q');
    git('config', 'user.email', 'test@example.invalid');
    git('config', 'user.name', 'capture-guard-test');
    git('config', 'core.autocrlf', 'false');
    fs.writeFileSync(path.join(repo, 'committed.json'), '{"a":1}\n');
    fs.writeFileSync(path.join(repo, 'modified.json'), '{"b":1}\n');
    fs.writeFileSync(path.join(repo, 'staged-then-modified.json'), '{"c":1}\n');
    git('add', 'committed.json', 'modified.json');
    git('commit', '-q', '-m', 'seed');
    fs.writeFileSync(path.join(repo, 'modified.json'), '{"b":2}\n'); // ` M`
    fs.writeFileSync(path.join(repo, 'untracked.json'), '{"u":1}\n'); // `??`
    fs.writeFileSync(path.join(repo, 'staged-new.json'), '{"s":1}\n');
    git('add', 'staged-new.json'); // `A `
    git('add', 'staged-then-modified.json');
    fs.writeFileSync(path.join(repo, 'staged-then-modified.json'), '{"c":2}\n'); // `AM`
  });
  afterAll(() => {
    if (repo) fs.rmSync(repo, { recursive: true, force: true });
  });

  it('absent → {exists:false}', () => {
    expect(harness.captureGitState(path.join(repo, 'nope.json'), { cwd: repo })).toEqual({ exists: false, tracked: false, worktreeClean: true });
  });
  it('committed + clean → tracked, worktreeClean (the only state --overwrite may replace)', () => {
    expect(harness.captureGitState(path.join(repo, 'committed.json'), { cwd: repo })).toEqual({ exists: true, tracked: true, worktreeClean: true });
  });
  it('staged-new (`A `) → tracked in the INDEX and clean — a capture staged for THIS commit is recoverable (git checkout -- restores the indexed content)', () => {
    expect(harness.captureGitState(path.join(repo, 'staged-new.json'), { cwd: repo })).toEqual({ exists: true, tracked: true, worktreeClean: true });
  });
  it('committed but modified in the worktree (` M`) → tracked, NOT clean', () => {
    expect(harness.captureGitState(path.join(repo, 'modified.json'), { cwd: repo })).toEqual({ exists: true, tracked: true, worktreeClean: false });
  });
  it('staged then modified again (`AM`) → tracked, NOT clean', () => {
    expect(harness.captureGitState(path.join(repo, 'staged-then-modified.json'), { cwd: repo })).toEqual({ exists: true, tracked: true, worktreeClean: false });
  });
  it('untracked (`??`) → NOT tracked (ls-files decides — an ignored path would read the same, never "clean" by porcelain silence)', () => {
    expect(harness.captureGitState(path.join(repo, 'untracked.json'), { cwd: repo })).toEqual({ exists: true, tracked: false, worktreeClean: true });
  });
  it('RED — the two probes are NOT interchangeable: porcelain alone is silent for a committed-clean file AND says nothing about tracking; the untracked case is only caught by ls-files', () => {
    const porcelain = git('status', '--porcelain', '--', 'untracked.json');
    expect(porcelain.startsWith('??')).toBe(true); // porcelain reports it, but as untracked — not a "clean" signal
    const cleanPorcelain = git('status', '--porcelain', '--', 'committed.json');
    expect(cleanPorcelain).toBe(''); // silence == clean only ONCE tracking is established by ls-files
  });
});

describe('the real CLI refuses a committed capture without --overwrite, before spawning the step', () => {
  it('exit code 1 with the refusal message naming the file and the --overwrite remedy; no DB, no child run', () => {
    const target = 'docs/reports/golden/assert_schema/post/standalone.json';
    const before = fs.readFileSync(path.join(REPO_ROOT, target), 'utf8');
    const r = spawnSync(process.execPath, ['scripts/analysis/capture-step-golden.js', '--step=scripts/quality/assert-schema.js', '--chain=none', `--out=${target}`], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      env: { ...process.env, DATABASE_URL: 'postgresql://invalid:invalid@127.0.0.1:1/invalid' },
      timeout: 60_000,
    });
    expect(r.status, `${r.stdout}\n${r.stderr}`).not.toBe(0);
    expect(`${r.stdout}${r.stderr}`).toContain('refusing --out=');
    expect(`${r.stdout}${r.stderr}`).toContain('--overwrite');
    expect(fs.readFileSync(path.join(REPO_ROOT, target), 'utf8')).toBe(before); // untouched
  });
});
