'use strict';
/**
 * SPEC LINK: docs/specs/00-architecture/08_agents.md §C.3 (F10)
 *
 * `captureWorktree(repoRoot)` — the pre/post worktree snapshot required on
 * every `write_file`/`edit_file`/`run_bash_command`/`git_commit` ledger
 * record: `{ status_porcelain, status_sha256, diff_sha256, head_sha }`.
 * Reconciliation (exit criterion #2) reads THIS pair, not a global 1:1
 * ledger↔diff count — a `write_file`/`edit_file` record's delta must name
 * exactly its own path, a `run_bash_command` record's delta must be EMPTY
 * (guaranteed by the read-only v1 allowlist), and a `git_commit` record's
 * delta is confined to its own `paths` plus `lint-staged` formatting.
 */

const crypto = require('crypto');
const { execFileSync } = require('child_process');
const { scrubbedEnv } = require('./exec-env');

const STATUS_CAP_BYTES = 16 * 1024;

function sha256Hex(str) {
  return crypto.createHash('sha256').update(str).digest('hex');
}

function runGit(repoRoot, args) {
  try {
    return execFileSync('git', args, { cwd: repoRoot, env: scrubbedEnv(), encoding: 'utf8' });
  } catch (err) {
    // A non-zero git exit here (e.g. `git diff` in a repo with zero commits)
    // still yields usable, deterministic output on stdout for our purposes.
    return typeof err.stdout === 'string' ? err.stdout : '';
  }
}

function captureWorktree(repoRoot) {
  let statusPorcelain = runGit(repoRoot, ['status', '--porcelain']);
  if (Buffer.byteLength(statusPorcelain, 'utf8') > STATUS_CAP_BYTES) {
    statusPorcelain = Buffer.from(statusPorcelain, 'utf8').subarray(0, STATUS_CAP_BYTES).toString('utf8');
  }
  const diffText = runGit(repoRoot, ['diff', 'HEAD']);
  const headSha = runGit(repoRoot, ['rev-parse', 'HEAD']).trim() || 'unknown';

  return {
    status_porcelain: statusPorcelain,
    status_sha256: sha256Hex(statusPorcelain),
    diff_sha256: sha256Hex(diffText),
    head_sha: headSha,
  };
}

module.exports = { captureWorktree };
